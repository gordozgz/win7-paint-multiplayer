'use strict';
// Multiplayer session.
//
// Ordering: the lobby owner (host) gives every op a global sequence number;
// everyone applies ops in that order, so all canvases stay identical.
//
// Reliability on top of Steam P2P (which can lose data when a session breaks):
//  - guest -> host: each op carries a per-guest counter (cs). The host applies
//    a guest's ops strictly in cs order; the guest re-sends anything that is
//    not confirmed in time. Duplicates are acknowledged and dropped.
//  - host -> guests: ops carry seq. A guest that sees a hole (or a heartbeat
//    ahead of what it has) asks for the missing range from the host's history,
//    and only falls back to a full state transfer if that fails.
//  - a periodic canvas hash catches anything else (full state with pixels).
// Presence (cursors, strokes in progress) may be lossy: it is only a preview.
(function (P) {
  const U = P.util
  const D = P.doc

  const PEER_COLORS = ['#e81123', '#0078d7', '#107c10', '#ff8c00', '#8764b8', '#00b7c3', '#e3008c', '#986f0b',
    '#4f6bed', '#ca5010', '#038387', '#881798', '#498205', '#c239b3', '#7a7574', '#00cc6a']
  const HIST_MAX = 800
  const OOO_MAX = 3000

  // ---------------------------------------------------------------- transports
  class SteamTransport {
    constructor () {
      this.kind = 'steam'
      this.api = window.native.steam
      this.handlers = {}
    }
    async init () {
      const st = await this.api.init()
      if (!st.ok) return st
      this.me = st.id; this.name = st.name; this.avatar = st.avatar
      this.api.onPacket((from, text) => {
        let msg
        try { msg = JSON.parse(text) } catch (e) { return }
        this.handlers.message && this.handlers.message(from, msg)
      })
      this.api.onLobby(s => this.handlers.lobby && this.handlers.lobby(s))
      this.api.onJoinRequest(id => this.handlers.joinRequest && this.handlers.joinRequest(id))
      this.api.onProgress((from, got, total) => this.handlers.progress && this.handlers.progress(from, got, total))
      this.api.onP2PFail((id, err) => this.handlers.p2pfail && this.handlers.p2pfail(id, err))
      this.api.onWarn(kind => this.handlers.warn && this.handlers.warn(kind))
      return st
    }
    on (ev, fn) { this.handlers[ev] = fn }
    createLobby (type, max) { return this.api.createLobby(type, max) }
    joinLobby (id) { return this.api.joinLobby(id) }
    leave () { return this.api.leaveLobby() }
    list () { return this.api.listLobbies() }
    invite () { return this.api.invite() }
    diagnostics () { return this.api.diagnostics() }
    send (targets, msg, reliable) {
      if (!targets.length) return
      this.api.send(targets, U.stringify(msg), reliable !== false)
    }
  }

  // Test transport for browser tabs on one machine (no Steam).
  // ?loss=0.2 drops that share of messages, to exercise the recovery code.
  class LoopTransport {
    constructor () {
      this.kind = 'loop'
      this.handlers = {}
      this.me = 'tab-' + Math.random().toString(36).slice(2, 8)
      this.name = P.T('Вкладка {id}', { id: this.me.slice(4, 7).toUpperCase() })
      this.lobby = null
      this.loss = Number(new URLSearchParams(location.search).get('loss') || 0)
      this.stallUntil = 0
      this.bc = new BroadcastChannel('mp-paint-loop')
      this.bc.onmessage = e => this.onRaw(e.data)
      window.addEventListener('beforeunload', () => this.leave())
      setInterval(() => this.heartbeat(), 1000)
    }
    async init () { return { ok: true, id: this.me, name: this.name } }
    on (ev, fn) { this.handlers[ev] = fn }
    post (m) { m.from = this.me; this.bc.postMessage(m) }
    state () {
      if (!this.lobby) return null
      return { id: this.lobby.id, owner: this.lobby.members[0], me: this.me, max: 8, members: this.lobby.members.map(id => ({ id, name: this.lobby.names[id] || null })) }
    }
    emitLobby () { this.handlers.lobby && this.handlers.lobby(this.state()) }
    async createLobby () {
      this.leave()
      this.lobby = { id: 'L' + Math.floor(Math.random() * 1e9), members: [this.me], names: { [this.me]: this.name }, seen: {} }
      this.emitLobby()
      return { ok: true, state: this.state() }
    }
    async joinLobby (id) {
      this.leave()
      return new Promise(resolve => {
        this.pendingJoin = { id, resolve }
        this.post({ sys: 'join', lobby: id, name: this.name })
        setTimeout(() => { if (this.pendingJoin) { this.pendingJoin = null; resolve({ ok: false, error: 'Лобби не найдено' }) } }, 1500)
      })
    }
    leave () {
      if (this.lobby) { this.post({ sys: 'leave', lobby: this.lobby.id }); this.lobby = null; this.emitLobby() }
    }
    async list () {
      this.found = {}
      this.post({ sys: 'list' })
      await new Promise(r => setTimeout(r, 300))
      return { ok: true, lobbies: Object.values(this.found) }
    }
    invite () { return false }
    async diagnostics () { return null }
    heartbeat () {
      if (!this.lobby) return
      this.post({ sys: 'hb', lobby: this.lobby.id })
      if (this.lobby.members[0] === this.me) {
        const now = Date.now(); let changed = false
        this.lobby.members = this.lobby.members.filter(id => {
          if (id === this.me) return true
          const ok = now - (this.lobby.seen[id] || now) < 4000
          if (!ok) changed = true
          return ok
        })
        if (changed) this.broadcastMembers()
      }
    }
    broadcastMembers () {
      this.post({ sys: 'members', lobby: this.lobby.id, members: this.lobby.members, names: this.lobby.names })
      this.emitLobby()
    }
    onRaw (m) {
      if (m.from === this.me) return
      if (m.sys) {
        const L = this.lobby
        const owner = L && L.members[0] === this.me
        if (m.sys === 'list' && owner) this.post({ sys: 'lobbyinfo', to: m.from, info: { id: L.id, host: this.name, members: L.members.length, max: 8, ver: '3' } })
        if (m.sys === 'lobbyinfo' && m.to === this.me && this.found) this.found[m.info.id] = m.info
        if (m.sys === 'join' && owner && m.lobby === L.id) {
          if (!L.members.includes(m.from)) L.members.push(m.from)
          L.names[m.from] = m.name; L.seen[m.from] = Date.now()
          this.broadcastMembers()
        }
        if (m.sys === 'members') {
          if (this.pendingJoin && m.lobby === this.pendingJoin.id && m.members.includes(this.me)) {
            this.lobby = { id: m.lobby, members: m.members, names: m.names, seen: {} }
            const pj = this.pendingJoin; this.pendingJoin = null
            pj.resolve({ ok: true, state: this.state() })
            this.emitLobby()
          } else if (L && m.lobby === L.id) {
            if (!m.members.includes(this.me)) { this.lobby = null; this.emitLobby(); return }
            L.members = m.members; L.names = m.names
            this.emitLobby()
          }
        }
        if (m.sys === 'hb' && L && m.lobby === L.id) L.seen[m.from] = Date.now()
        if (m.sys === 'leave' && L && m.lobby === L.id && L.members.includes(m.from)) {
          L.members = L.members.filter(id => id !== m.from)
          if (L.members[0] === this.me) this.broadcastMembers(); else this.emitLobby()
        }
        return
      }
      if (!this.lobby || !this.lobby.members.includes(m.from)) return
      if (m.to.includes(this.me)) {
        if (Date.now() < this.stallUntil || (this.loss && Math.random() < this.loss)) return
        // simulated latency; one FIFO per sender keeps order like a reliable channel
        this.inbox = this.inbox || {}
        const q = this.inbox[m.from] || (this.inbox[m.from] = [])
        q.push({ at: Date.now() + 15 + Math.random() * 25, msg: JSON.parse(m.data) })
        if (q.length === 1) this.drainInbox(m.from)
      }
    }
    drainInbox (from) {
      const q = this.inbox[from]
      if (!q.length) return
      setTimeout(() => {
        const now = Date.now()
        while (q.length && q[0].at <= now) {
          const { msg } = q.shift()
          try { if (this.handlers.message) this.handlers.message(from, msg) } catch (e) { console.error(e) }
        }
        this.drainInbox(from)
      }, Math.max(0, q[0].at - Date.now()))
    }
    send (targets, msg) {
      if (!targets.length) return
      this.post({ to: targets, data: U.stringify(msg) })
    }
  }

  // ---------------------------------------------------------------- session
  const S = P.net = U.emitter({
    role: 'offline', // offline | joining | host | client
    transport: null,
    available: false,
    error: null,
    me: 'local',
    myName: 'Я',
    myAvatar: null,
    lobby: null,
    hostId: null,
    welcomed: true, // we have a state from the current host
    synced: true, // a welcome is on its way or applied; host ops may be applied
    seq: 0, // last seq applied to the doc
    recvSeq: 0, // last seq accepted into the apply queue
    hostHead: 0, // highest seq the host told us about
    hostSeq: 0, // host: last seq assigned
    counter: 0,
    cs: 0, // guest: per-session submit counter
    css: Math.random().toString(36).slice(2, 10),
    rtt: null,
    hostSilent: false,
    peers: new Map(),
    pending: new Map(),
    seenIds: new Set(),
    queue: [],
    busy: false,
    myOps: [],
    myRedo: [],
    showCursors: true,
    showNames: true,
    liveEnabled: true,
    stats: { resyncs: 0, resends: 0, needs: 0, liveGaps: 0, welcomes: 0, served: 0 }
  })

  S.log = function (...a) {
    const line = a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')
    console.log('[net]', line)
    if (window.native && window.native.log) window.native.log(line)
  }

  S.init = async function () {
    let t = null
    if (window.native && window.native.steam) t = new SteamTransport()
    else if (typeof BroadcastChannel !== 'undefined') t = new LoopTransport()
    if (!t) return
    const st = await t.init()
    if (!st.ok) {
      S.error = st.error
      S.emit('status')
      return
    }
    S.transport = t
    S.available = true
    S.me = st.id
    S.myName = st.name
    S.myAvatar = st.avatar || null
    t.on('message', onMessage)
    t.on('lobby', onLobby)
    t.on('joinRequest', id => S.emit('joinRequest', id))
    t.on('progress', (from, got, total) => S.emit('progress', from, got, total))
    t.on('warn', kind => S.emit('warn', kind))
    t.on('p2pfail', id => {
      S.log('p2p fail with', id)
      if (S.role === 'client' && id === S.hostId) { resendPending(true); scheduleNeed(300) }
    })
    setInterval(tickFast, 250)
    setInterval(tickSlow, 1000)
    setInterval(logDiagnostics, 30000)
    S.emit('status')
  }

  S.newId = () => S.me + ':' + (++S.counter) + ':' + Math.floor(Math.random() * 1e6).toString(36)
  S.isOnline = () => S.role !== 'offline'
  S.peerList = () => Array.from(S.peers.values())
  S.colorOf = id => (S.peers.get(id) || {}).color || '#0078d7'

  const isMeta = op => op.t === 'undo' || op.t === 'redo'

  // undone flags implied by our undo/redo ops the host hasn't confirmed yet
  S.localFlags = function () {
    const m = new Map()
    for (const op of S.pending.values()) if (isMeta(op)) m.set(op.target, op.t === 'undo')
    return m
  }
  const hasPendingMeta = () => { for (const op of S.pending.values()) if (isMeta(op)) return true; return false }

  // ================================================================ submitting
  S.submit = function (op) {
    if (!op.id) op.id = S.newId()
    op.u = S.me
    if (!isMeta(op)) {
      S.myOps.push(op.id)
      S.myRedo = []
      if (op.t === 'load') { S.myOps = []; S.myRedo = [] }
    }
    if (S.role === 'client') {
      op.cs = ++S.cs
      op.css = S.css
      S.pending.set(op.id, op)
      sendSubmit(op)
      // undo/redo take effect right away; the host's echo only confirms them
      if (isMeta(op) && D.setUndone(op.target, op.t === 'undo')) S.emit('commit', op)
      S.emit('pending')
    } else {
      sequence(op)
    }
  }

  function lowestPendingCs () {
    let m = Infinity
    for (const o of S.pending.values()) if (o.cs != null && o.cs < m) m = o.cs
    return m === Infinity ? S.cs + 1 : m
  }

  function sendSubmit (op) {
    op._sentAt = Date.now()
    S.send(S.hostId, { t: 'submit', op, base: lowestPendingCs() })
  }

  // guest: re-send ops the host hasn't confirmed in time
  function resendPending (now) {
    if (S.role !== 'client' || !S.pending.size) return
    const t = Date.now()
    const rto = Math.max(700, (S.rtt || 300) * 2.5 + 150)
    for (const op of S.pending.values()) {
      const wait = Math.min(8000, rto * Math.pow(1.6, op._tries || 0))
      if (now || t - (op._sentAt || 0) > wait) {
        op._tries = (op._tries || 0) + 1
        S.stats.resends++
        if (op._tries === 1 || op._tries % 5 === 0) S.log('resend', op.t, 'cs', op.cs, 'try', op._tries)
        sendSubmit(op)
      }
    }
  }

  // ================================================================ host side
  const hist = [] // recent {seq, op}, to repair holes on guests
  const inbound = new Map() // guest+session -> { next, buf }
  let inboundWarnAt = 0

  function onSubmit (from, msg) {
    const op = msg.op
    if (!op || !op.id) return
    op.u = from
    if (op.cs == null) { sequence(op, from); return }
    const key = from + '/' + op.css
    let st = inbound.get(key)
    if (!st) {
      st = { next: Math.min(msg.base || op.cs, op.cs), buf: new Map(), from }
      inbound.set(key, st)
    }
    if (msg.base > st.next) {
      // the guest already has everything below base
      for (const k of Array.from(st.buf.keys())) if (k < msg.base) st.buf.delete(k)
      st.next = msg.base
    }
    if (op.cs < st.next) { S.send(from, { t: 'ack', id: op.id }); return }
    if (!st.buf.has(op.cs)) st.buf.set(op.cs, op)
    while (st.buf.has(st.next)) {
      const o = st.buf.get(st.next)
      st.buf.delete(st.next)
      st.next++
      sequence(o, from)
    }
    if (st.buf.size && Date.now() - inboundWarnAt > 2000) {
      inboundWarnAt = Date.now()
      S.log('waiting for guest op', from, 'cs', st.next, 'buffered', st.buf.size)
    }
  }

  // from: the guest that submitted it (absent for our own ops)
  function sequence (op, from) {
    if (S.seenIds.has(op.id) || (!isMeta(op) && D.findOp(op.id) >= 0)) {
      // a re-send of something already ordered: tell the guest so it stops waiting
      if (from) S.send(from, { t: 'ack', id: op.id })
      return
    }
    S.seenIds.add(op.id)
    if (S.seenIds.size > 6000) S.seenIds = new Set(Array.from(S.seenIds).slice(-3000))
    const seq = ++S.hostSeq
    hist.push({ seq, op })
    if (hist.length > HIST_MAX) hist.splice(0, hist.length - HIST_MAX)
    enqueue({ seq, op })
    if (S.peers.size) S.broadcast({ t: 'op', seq, op })
  }

  function serveNeed (to, fromSeq) {
    if (S.role !== 'host' || fromSeq > S.hostSeq) return
    if (hist.length && hist[0].seq <= fromSeq) {
      const items = []
      for (const h of hist) if (h.seq >= fromSeq) items.push({ seq: h.seq, op: h.op })
      S.stats.served++
      S.log('re-send ops to', to, fromSeq + '..' + S.hostSeq)
      S.send(to, { t: 'ops', items })
    } else {
      sendWelcome(to, 'need beyond history')
    }
  }

  const welcomeState = new Map()
  async function sendWelcome (to, why) {
    const key = to || '*'
    const st = welcomeState.get(key) || {}
    if (st.busy) return
    st.busy = true
    welcomeState.set(key, st)
    try {
      const wait = (st.at || 0) + 1500 - Date.now()
      if (wait > 0) await new Promise(r => setTimeout(r, wait))
      while (S.busy || S.queue.length) await S.whenIdle()
      if (S.role !== 'host') return
      const seq = S.seq
      const t0 = performance.now()
      const state = await D.exportStateAsync(true)
      if (S.role !== 'host') return
      S.stats.welcomes++
      S.log('welcome to', key, 'seq', seq, 'ops', state.ops.length, 'why', why || 'join', Math.round(performance.now() - t0) + 'ms')
      const msg = { t: 'welcome', seq, state }
      if (to) S.send(to, msg); else S.broadcast(msg)
    } finally {
      st.busy = false
      st.at = Date.now()
    }
  }

  // ================================================================ apply queue
  function enqueue (item) {
    S.queue.push(item)
    pump()
  }

  let idleWaiters = []
  S.whenIdle = function () {
    if (!S.busy && !S.queue.length) return Promise.resolve()
    return new Promise(r => idleWaiters.push(r))
  }

  // give the browser a turn (input, painting) between slices of queued work
  const yieldChannel = new MessageChannel()
  const yieldWaiters = []
  yieldChannel.port1.onmessage = () => { const r = yieldWaiters.shift(); if (r) r() }
  const yieldNow = () => (window.scheduler && window.scheduler.yield)
    ? window.scheduler.yield()
    : new Promise(r => { yieldWaiters.push(r); yieldChannel.port2.postMessage(0) })

  let lastChange = 0
  let inFlight = null // op taken from the queue, still decoding
  async function pump () {
    if (S.busy) return
    S.busy = true
    let slice = performance.now()
    try {
      while (S.queue.length) {
        if (performance.now() - slice > 12) { await yieldNow(); slice = performance.now() }
        const item = S.queue.shift()
        if (item.welcome) {
          const t0 = performance.now()
          try {
            await D.importState(item.welcome.state)
          } catch (e) {
            S.log('welcome import failed', e.message)
            requestResync('import failed')
            continue
          }
          S.seq = item.welcome.seq
          S.welcomed = true
          S.log('state loaded seq', S.seq, Math.round(performance.now() - t0) + 'ms')
          afterWelcome()
          continue
        }
        if (item.hash) {
          checkHash(item.hash)
          continue
        }
        const op = item.op
        inFlight = op
        try { await D.prepare(op) } catch (e) { S.log('image decode failed', e.message) }
        inFlight = null
        if (S.role === 'client' && !isMeta(op) && S.pending.size) {
          const lf = S.localFlags()
          if (lf.has(op.id)) op.undone = lf.get(op.id)
        }
        D.commit(op)
        S.seq = item.seq
        lastChange = Date.now()
        afterCommit(op)
      }
    } finally {
      S.busy = false
    }
    const w = idleWaiters; idleWaiters = []
    w.forEach(r => r())
  }

  function afterCommit (op) {
    if (op.t === 'load') {
      S.myOps = S.myOps.filter(id => S.pending.has(id))
      S.myRedo = []
    }
    if (S.pending.delete(op.id)) S.emit('pending')
    const peer = S.peers.get(op.u)
    if (peer) {
      peer.done.add(op.id)
      if (peer.done.size > 200) peer.done = new Set(Array.from(peer.done).slice(-100))
      if (peer.live && peer.live.op.id === op.id) { peer.live = null; S.emit('live', peer, true) }
    }
    S.emit('commit', op)
  }

  function afterWelcome () {
    const ids = new Set(D.ops.map(o => o.id))
    // drop what the host already has; the rest is re-sent below (the host acks
    // anything it had already ordered, e.g. undo/redo, which leave no op behind)
    for (const id of Array.from(S.pending.keys())) if (ids.has(id)) S.pending.delete(id)
    S.myOps = S.myOps.filter(id => ids.has(id) || S.pending.has(id))
    S.myRedo = S.myRedo.filter(id => ids.has(id) || S.pending.has(id))
    // our unconfirmed undo/redo stay visible on top of the host's state
    for (const [target, flag] of S.localFlags()) D.setUndone(target, flag)
    resendPending(true)
    drainOOO()
    S.emit('pending')
    S.emit('welcomed')
    S.emit('commit', null)
  }

  // ================================================================ guest side
  const ooo = new Map() // ops that arrived ahead of a missing one (or before the welcome)

  function hostMsg (from) { return S.role === 'client' && from === S.hostId }

  function acceptOp (seq, op) {
    if (seq <= S.recvSeq || ooo.has(seq) || ooo.size > OOO_MAX) return
    ooo.set(seq, op)
    if (seq > S.hostHead) S.hostHead = seq
  }

  function drainOOO () {
    if (!S.synced) return
    while (ooo.has(S.recvSeq + 1)) {
      const seq = S.recvSeq + 1
      const op = ooo.get(seq)
      ooo.delete(seq)
      S.recvSeq = seq
      enqueue({ seq, op })
    }
    if (ooo.size || S.hostHead > S.recvSeq) scheduleNeed()
    else need.tries = 0
  }

  const need = { timer: 0, tries: 0 }
  function scheduleNeed (delay) {
    if (need.timer) return
    need.timer = setTimeout(() => {
      need.timer = 0
      if (S.role !== 'client' || !S.synced) return
      for (const k of Array.from(ooo.keys())) if (k <= S.recvSeq) ooo.delete(k)
      const behind = ooo.size > 0 || S.hostHead > S.recvSeq
      if (!behind) { need.tries = 0; return }
      if (++need.tries > 4) { need.tries = 0; requestResync('holes not repaired'); return }
      S.stats.needs++
      S.log('need from', S.recvSeq + 1, 'host head', S.hostHead, 'buffered', ooo.size)
      S.send(S.hostId, { t: 'need', from: S.recvSeq + 1 })
      scheduleNeed(Math.max(1500, (S.rtt || 300) * 4))
    }, delay == null ? 150 : delay)
  }

  // Full state transfer; repeated until it arrives.
  let syncTimer = 0
  let syncTries = 0
  let lastResyncAt = 0
  function startSync (kind) {
    clearInterval(syncTimer)
    syncTries = 0
    const go = () => {
      if (S.synced || S.role !== 'client') { clearInterval(syncTimer); syncTimer = 0; return }
      if (++syncTries > 20) {
        clearInterval(syncTimer); syncTimer = 0
        S.log('host does not answer, leaving')
        S.emit('error', 'Хост не отвечает. Попробуйте подключиться ещё раз.')
        S.leave()
        return
      }
      if (kind === 'join') {
        S.send(S.hostId, { t: 'join', name: S.myName })
        S.broadcast({ t: 'hello', name: S.myName })
      } else S.send(S.hostId, { t: 'resync' })
    }
    go()
    syncTimer = setInterval(go, 3000)
  }

  let resyncLater = 0
  function requestResync (why) {
    if (S.role !== 'client' || !S.synced) return
    const now = Date.now()
    if (now - lastResyncAt < 5000) {
      if (!resyncLater) resyncLater = setTimeout(() => { resyncLater = 0; requestResync(why) }, 5000 - (now - lastResyncAt))
      return
    }
    lastResyncAt = now
    S.stats.resyncs++
    S.log('resync requested:', why)
    S.synced = false
    S.welcomed = false
    S.emit('status')
    startSync('resync')
  }

  function checkHash (h) {
    if (S.role !== 'client' || !S.synced) return
    if (h.seq > S.hostHead) S.hostHead = h.seq
    if (S.seq < h.seq) { scheduleNeed(); return }
    if (h.seq !== S.seq || hasPendingMeta()) return
    const mine = D.hash()
    if (mine !== h.h) {
      S.log('canvas differs from host at seq', h.seq, mine, h.h)
      requestResync('canvas hash mismatch')
    }
  }

  // ================================================================ undo / redo (per user)
  // also counts ops already ordered but still waiting in the apply queue
  // (e.g. Ctrl+Z right after pasting an image that is still being decoded)
  // Only the last UNDO_WINDOW ops are undoable — the same rule on every peer,
  // so an undo never targets an op that some guest has already folded away.
  function exists (id) {
    if (S.pending.has(id) || (inFlight && inFlight.id === id) || S.queue.some(q => q.op && q.op.id === id)) return true
    const i = D.findOp(id)
    return i >= 0 && i >= D.ops.length - D.UNDO_WINDOW
  }

  S.undo = function () {
    while (S.myOps.length) {
      const id = S.myOps.pop()
      if (!exists(id)) continue
      S.myRedo.push(id)
      S.submit({ t: 'undo', target: id })
      return true
    }
    return false
  }
  S.redo = function () {
    while (S.myRedo.length) {
      const id = S.myRedo.pop()
      if (!exists(id)) continue
      S.myOps.push(id)
      S.submit({ t: 'redo', target: id })
      return true
    }
    return false
  }
  S.canUndo = () => S.myOps.some(exists)
  S.canRedo = () => S.myRedo.some(exists)

  // ================================================================ messaging
  S.send = function (to, msg, reliable) {
    if (!S.transport || !to) return
    S.transport.send([to], msg, reliable)
  }
  S.broadcast = function (msg, reliable) {
    if (!S.transport || !S.peers.size) return
    S.transport.send(Array.from(S.peers.keys()), msg, reliable)
  }

  function onMessage (from, msg) {
    if (!msg || !msg.t) return
    let peer = S.peers.get(from)
    if (!peer) {
      if (!S.lobby || !S.lobby.members.some(m => m.id === from)) {
        if (!(S.role === 'host' && msg.t === 'join')) return
      }
      peer = addPeer(from, msg.name)
    }
    peer.lastSeen = Date.now()
    switch (msg.t) {
      case 'hello':
        if (msg.name && !peer.steamName) { peer.name = msg.name; S.emit('peers') }
        break
      case 'join':
        if (msg.name && !peer.steamName) { peer.name = msg.name; S.emit('peers') }
        if (S.role === 'host') sendWelcome(from, 'join')
        break
      case 'resync':
        if (S.role === 'host') sendWelcome(from, 'resync')
        break
      case 'need':
        serveNeed(from, msg.from)
        break
      case 'submit':
        if (S.role === 'host') onSubmit(from, msg)
        break
      case 'ack':
        if (hostMsg(from) && S.pending.delete(msg.id)) S.emit('pending')
        break
      case 'welcome':
        if (S.role === 'client' && from === S.hostId) {
          // from here on ops are applied again, even while the state is loading
          S.synced = true
          S.recvSeq = msg.seq
          if (msg.seq > S.hostHead) S.hostHead = msg.seq
          S.queue = []
          for (const k of Array.from(ooo.keys())) if (k <= msg.seq) ooo.delete(k)
          clearInterval(syncTimer); syncTimer = 0
          enqueue({ welcome: msg })
        }
        break
      case 'op':
        if (!hostMsg(from)) break
        acceptOp(msg.seq, msg.op)
        drainOOO()
        break
      case 'ops':
        if (!hostMsg(from) || !msg.items) break
        for (const it of msg.items) acceptOp(it.seq, it.op)
        drainOOO()
        break
      case 'hb':
        if (!hostMsg(from)) break
        if (msg.seq > S.hostHead) S.hostHead = msg.seq
        if (S.synced && S.hostHead > S.recvSeq) scheduleNeed()
        break
      case 'hash':
        if (hostMsg(from) && S.synced) enqueue({ hash: msg })
        break
      case 'ping':
        S.send(from, { t: 'pong', ts: msg.ts }, false)
        break
      case 'pong': {
        const rtt = performance.now() - msg.ts
        if (rtt >= 0 && rtt < 30000) {
          peer.rtt = peer.rtt == null ? rtt : peer.rtt * 0.75 + rtt * 0.25
          if (from === S.hostId) S.rtt = peer.rtt
        }
        break
      }
      case 'cur':
        peer.cursor = { x: msg.x, y: msg.y, t: Date.now(), tool: msg.tool }
        S.emit('cursor', peer)
        break
      case 'ls':
        if (!msg.op || peer.done.has(msg.op.id)) break
        peer.live = { op: msg.op, runs: [msg.op.p ? msg.op.p.slice() : []], n: msg.op.p ? msg.op.p.length >> 1 : 0 }
        S.emit('live', peer, true)
        break
      case 'lp': {
        const L = peer.live
        if (!L || L.vector || L.op.id !== msg.id || !msg.p) break
        if (msg.i > L.n) {
          // a chunk got lost: start a new run instead of joining with a straight line
          L.runs.push([])
          S.stats.liveGaps++
        }
        const skip = Math.max(0, L.n - msg.i) * 2
        if (skip >= msg.p.length) break
        const run = L.runs[L.runs.length - 1]
        for (let k = skip; k < msg.p.length; k++) run.push(msg.p[k])
        L.n = Math.max(L.n, msg.i + (msg.p.length >> 1))
        S.emit('live', peer, false)
        break
      }
      case 'lv':
        if (!msg.op || peer.done.has(msg.op.id)) break
        peer.live = { op: msg.op, vector: true }
        S.emit('live', peer, true)
        break
      case 'lc':
        if (peer.live && peer.live.op.id === msg.id) { peer.live = null; S.emit('live', peer, true) }
        peer.done.add(msg.id)
        break
    }
  }

  // ================================================================ lobby / peers
  function addPeer (id, name) {
    let p = S.peers.get(id)
    if (p) return p
    p = { id, name: name || 'Игрок', steamName: false, avatar: null, color: '#0078d7', cursor: null, live: null, done: new Set(), rtt: null, lastSeen: Date.now() }
    S.peers.set(id, p)
    recolor()
    S.emit('peers')
    return p
  }

  function removePeer (id) {
    const p = S.peers.get(id)
    if (!p) return
    S.peers.delete(id)
    for (const [k, st] of Array.from(inbound)) if (st.from === id) inbound.delete(k)
    welcomeState.delete(id)
    S.emit('peerLeft', p)
    S.emit('peers')
  }

  function recolor () {
    if (!S.lobby) return
    S.lobby.members.forEach((m, i) => {
      const p = S.peers.get(m.id)
      if (p) p.color = PEER_COLORS[i % PEER_COLORS.length]
      if (m.id === S.me) S.myColor = PEER_COLORS[i % PEER_COLORS.length]
    })
  }

  function onLobby (state) {
    if (!state) {
      if (S.lobby) leftLobby()
      return
    }
    const prevOwner = S.lobby && S.lobby.owner
    S.lobby = state
    const ids = new Set(state.members.map(m => m.id))
    for (const m of state.members) {
      if (m.id === S.me) { if (m.avatar) S.myAvatar = m.avatar; continue }
      const p = addPeer(m.id, m.name)
      if (m.name) { p.name = m.name; p.steamName = true }
      if (m.avatar) p.avatar = m.avatar
    }
    for (const id of Array.from(S.peers.keys())) if (!ids.has(id)) removePeer(id)
    recolor()

    if (state.owner === S.me && S.role !== 'host') {
      // we became host (created lobby, or host migration)
      const migrated = S.role === 'client'
      S.log(migrated ? 'became host (migration)' : 'hosting lobby', state.id)
      S.role = 'host'
      S.hostId = S.me
      S.hostSeq = S.seq
      D.keepOps = 120
      S.welcomed = true
      S.synced = true
      hist.length = 0
      inbound.clear()
      clearInterval(syncTimer); syncTimer = 0
      ooo.clear()
      const mine = Array.from(S.pending.values())
      S.pending.clear()
      if (migrated) sendWelcome(null, 'host migration').then(() => mine.forEach(op => sequence(op)))
      else mine.forEach(op => sequence(op))
      S.emit('pending')
      S.emit('role')
    } else if (state.owner !== S.me) {
      if (S.role !== 'client' || prevOwner !== state.owner) {
        // new host (first join or migration): wait for its full state
        S.log('host is', state.owner, prevOwner ? '(changed)' : '')
        S.role = 'client'
        S.hostId = state.owner
        S.welcomed = false
        S.synced = false
        S.hostHead = 0
        D.keepOps = 240
        ooo.clear()
        startSync('join')
        S.emit('role')
      }
    }
    S.emit('peers')
    S.emit('lobby')
  }

  function leftLobby () {
    const wasOnline = S.role !== 'offline'
    S.log('left lobby')
    S.lobby = null
    for (const id of Array.from(S.peers.keys())) removePeer(id)
    // keep the current picture and our pending work, continue offline
    const mine = Array.from(S.pending.values())
    S.pending.clear()
    S.role = 'offline'
    S.hostId = null
    S.welcomed = true
    S.synced = true
    S.hostSilent = false
    D.keepOps = 120
    S.rtt = null
    S.hostSeq = S.seq
    hist.length = 0
    inbound.clear()
    ooo.clear()
    for (const op of mine) sequence(op)
    clearInterval(syncTimer); syncTimer = 0
    if (wasOnline) S.emit('left')
    S.emit('role')
    S.emit('peers')
    S.emit('pending')
    S.emit('lobby')
  }

  S.createLobby = async function (type, max) {
    if (!S.transport) return { ok: false, error: S.error || 'Мультиплеер недоступен' }
    await S.whenIdle()
    const r = await S.transport.createLobby(type, max || 8)
    if (r.ok && r.state) onLobby(r.state)
    return r
  }

  S.joinLobby = async function (id) {
    if (!S.transport) return { ok: false, error: S.error || 'Мультиплеер недоступен' }
    S.welcomed = false
    S.role = 'joining'
    const r = await S.transport.joinLobby(id)
    if (!r.ok) {
      S.role = 'offline'; S.welcomed = true; S.synced = true
      return r
    }
    if (r.state) onLobby(r.state)
    return r
  }

  S.leave = function () {
    if (!S.transport) return
    S.transport.leave()
    leftLobby()
  }

  S.listLobbies = () => S.transport ? S.transport.list() : Promise.resolve({ ok: false, error: S.error })
  S.invite = () => S.transport && S.transport.invite()

  // ================================================================ presence
  let curTimer = 0; let lastCur = null
  S.cursor = function (x, y, tool) {
    if (!S.peers.size) return
    lastCur = { t: 'cur', x, y, tool }
    if (curTimer) return
    curTimer = setTimeout(() => { curTimer = 0; if (lastCur) S.broadcast(lastCur, false) }, 40)
  }

  let live = null; let liveTimer = 0
  S.liveStart = function (op) {
    if (!S.peers.size || !S.liveEnabled) return
    live = { op, sent: op.p.length }
    S.broadcast({ t: 'ls', op: Object.assign({}, op, { p: op.p.slice() }) })
  }
  S.livePoints = function (op) {
    if (!live || live.op !== op) return
    if (liveTimer) return
    liveTimer = setTimeout(flushLive, 30)
  }
  function flushLive () {
    liveTimer = 0
    if (!live) return
    const p = live.op.p
    if (p.length > live.sent) {
      S.broadcast({ t: 'lp', id: live.op.id, i: live.sent >> 1, p: p.slice(live.sent) })
      live.sent = p.length
    }
  }
  S.liveEnd = function (op) {
    if (live && live.op === op) { clearTimeout(liveTimer); liveTimer = 0; live = null }
  }
  let vecTimer = 0; let vecOp = null
  S.liveVector = function (op) {
    if (!S.peers.size || !S.liveEnabled) return
    vecOp = op
    if (vecTimer) return
    vecTimer = setTimeout(() => { vecTimer = 0; if (vecOp) S.broadcast({ t: 'lv', op: vecOp }) }, 50)
  }
  S.liveCancel = function (id) {
    if (live && live.op.id === id) { clearTimeout(liveTimer); liveTimer = 0; live = null }
    if (vecOp && vecOp.id === id) { clearTimeout(vecTimer); vecTimer = 0; vecOp = null }
    if (S.peers.size) S.broadcast({ t: 'lc', id })
  }
  S.liveVectorDone = function () { clearTimeout(vecTimer); vecTimer = 0; vecOp = null }

  // ================================================================ timers
  let lastHashAt = 0; let lastHashSeq = -1; let lastHbAt = 0
  function tickFast () {
    resendPending(false)
  }

  function tickSlow () {
    if (!S.isOnline() || !S.peers.size) return
    const now = Date.now()
    // ping everyone (also keeps P2P sessions alive in both directions)
    for (const p of S.peers.values()) S.send(p.id, { t: 'ping', ts: performance.now() }, false)
    if (S.role === 'host') {
      if (now - lastHbAt >= 1000) { lastHbAt = now; S.broadcast({ t: 'hb', seq: S.hostSeq }) }
      if (!S.busy && !S.queue.length && S.seq !== lastHashSeq && now - lastHashAt >= 3000 && now - lastChange >= 400) {
        lastHashAt = now
        lastHashSeq = S.seq
        S.broadcast({ t: 'hash', seq: S.seq, h: D.hash() })
      }
    } else if (S.role === 'client') {
      const host = S.peers.get(S.hostId)
      const silent = !!host && now - host.lastSeen > 6000
      if (silent !== S.hostSilent) {
        S.hostSilent = silent
        S.log(silent ? 'host silent for 6s' : 'host is back')
        S.emit('status')
        if (!silent) { resendPending(true); scheduleNeed(100) }
      }
    }
    S.emit('net')
  }

  async function logDiagnostics () {
    if (!S.isOnline()) return
    let steam = null
    try { steam = S.transport.diagnostics ? await S.transport.diagnostics() : null } catch (e) {}
    const peers = {}
    for (const p of S.peers.values()) peers[p.id] = { rtt: p.rtt == null ? null : Math.round(p.rtt), seen: Date.now() - p.lastSeen }
    S.log('stats', { role: S.role, seq: S.seq, pending: S.pending.size, ooo: ooo.size, stats: S.stats, peers, steam })
  }

  // long main-thread tasks hurt drawing; log them
  try {
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) if (e.duration > 300) S.log('long task', Math.round(e.duration) + 'ms')
    }).observe({ entryTypes: ['longtask'] })
  } catch (e) {}
})(window.P)
