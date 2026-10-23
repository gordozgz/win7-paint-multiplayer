'use strict'
// Steam layer (main process): lobbies, P2P packets, persona names/avatars.
// Uses AppID 480 (Spacewar) — the public Steamworks test app.
//
// The main process is Electron's browser process: if it blocks, mouse input
// for the window is lost (strokes turn into straight lines). So nothing here
// may do heavy synchronous work — big messages are (de)compressed on the
// libuv thread pool, with per-peer promise chains keeping message order.
const path = require('path')
const zlib = require('zlib')
const { promisify } = require('util')

const deflateRaw = promisify(zlib.deflateRaw)
const inflateRaw = promisify(zlib.inflateRaw)

const APP_ID = 480
const PROTO = '3'
const LOBBY_KEY = 'mp_paint'

const KIND_DEFLATE = 1
const KIND_CHUNK = 2
const KIND_RAW = 3
const KIND_PLAIN = 4
const CHUNK_SIZE = 256 * 1024
const ASYNC_ZLIB_MIN = 32 * 1024

const SEND_UNRELIABLE = 0
const SEND_RELIABLE = 2

let sw = null
try { sw = require('steamworks.js') } catch (e) { console.error('[steam] steamworks.js load failed:', e.message) }

let client = null
let ffi = null
let win = null
let lobby = null
let me = null
let myName = ''
let initError = null
let pollTimer = null
let acceptTimer = null
let msgCounter = 1
let memberCache = new Set()
let memberRefreshAt = 0
let emitTimer = null
let log = (...a) => console.log('[steam]', ...a)
const callbackHandles = []
const chunks = new Map()
const outQueues = new Map()
const recvChains = new Map()
let sendChain = Promise.resolve()
const avatarCache = new Map()
const dropLoggedAt = new Map()

function enableOverlay () {
  if (!sw) return
  try { sw.electronEnableSteamOverlay() } catch (e) { console.warn('[steam] overlay:', e.message) }
}

function setWindow (w) { win = w }
function setLogger (fn) { log = fn }

function emit (ch, ...args) {
  if (win && !win.isDestroyed()) win.webContents.send(ch, ...args)
}

function loadFFI () {
  if (process.platform !== 'win32') return null
  const koffi = require('koffi')
  const dll = path.join(path.dirname(require.resolve('steamworks.js')), 'dist', 'win64', 'steam_api64.dll')
  const lib = koffi.load(dll)
  const P2PSessionState = koffi.struct('P2PSessionState_t', {
    bConnectionActive: 'uint8',
    bConnecting: 'uint8',
    eP2PSessionError: 'uint8',
    bUsingRelay: 'uint8',
    nBytesQueuedForSend: 'int32',
    nPacketsQueuedForSend: 'int32',
    nRemoteIP: 'uint32',
    nRemotePort: 'uint16'
  })
  return {
    mm: lib.func('void* SteamAPI_SteamMatchmaking_v009()')(),
    friends: lib.func('void* SteamAPI_SteamFriends_v017()')(),
    utils: lib.func('void* SteamAPI_SteamUtils_v010()')(),
    net: lib.func('void* SteamAPI_SteamNetworking_v006()')(),
    netUtils: lib.func('void* SteamAPI_SteamNetworkingUtils_SteamAPI_v004()')(),
    addStr: lib.func('void SteamAPI_ISteamMatchmaking_AddRequestLobbyListStringFilter(void* self, const char* key, const char* val, int cmp)'),
    addDist: lib.func('void SteamAPI_ISteamMatchmaking_AddRequestLobbyListDistanceFilter(void* self, int f)'),
    addCount: lib.func('void SteamAPI_ISteamMatchmaking_AddRequestLobbyListResultCountFilter(void* self, int n)'),
    persona: lib.func('const char* SteamAPI_ISteamFriends_GetFriendPersonaName(void* self, uint64_t id)'),
    reqInfo: lib.func('bool SteamAPI_ISteamFriends_RequestUserInformation(void* self, uint64_t id, bool nameOnly)'),
    avatar: lib.func('int SteamAPI_ISteamFriends_GetMediumFriendAvatar(void* self, uint64_t id)'),
    imgSize: lib.func('bool SteamAPI_ISteamUtils_GetImageSize(void* self, int img, _Out_ uint32_t* w, _Out_ uint32_t* h)'),
    imgRGBA: lib.func('bool SteamAPI_ISteamUtils_GetImageRGBA(void* self, int img, void* dest, int size)'),
    sessionState: lib.func('bool SteamAPI_ISteamNetworking_GetP2PSessionState(void* self, uint64_t id, _Out_ P2PSessionState_t* st)'),
    allowRelay: lib.func('bool SteamAPI_ISteamNetworking_AllowP2PPacketRelay(void* self, bool allow)'),
    initRelay: lib.func('void SteamAPI_ISteamNetworkingUtils_InitRelayNetworkAccess(void* self)')
  }
}

function init () {
  if (client) return status()
  if (!sw) return { ok: false, error: 'Модуль steamworks.js не загружен' }
  try {
    client = sw.init(APP_ID)
  } catch (e) {
    client = null
    initError = 'Steam не запущен или недоступен (' + String((e && e.message) || e) + ')'
    log('init failed:', initError)
    return { ok: false, error: initError }
  }
  initError = null
  me = client.localplayer.getSteamId().steamId64
  myName = client.localplayer.getName()
  try { ffi = loadFFI() } catch (e) { log('FFI unavailable:', e.message); ffi = null }
  if (ffi) {
    try { ffi.allowRelay(ffi.net, true) } catch (e) {}
    // warm up Steam Datagram Relay now, so the first P2P connection is fast
    try { ffi.initRelay(ffi.netUtils) } catch (e) {}
  }

  // steamworks.js keeps only the latest handler per callback type, and a
  // dropped Handle may unregister it — keep the handles alive.
  const CB = sw.SteamCallback
  const on = (type, fn) => callbackHandles.push(client.callback.register(type, v => {
    try { fn(v) } catch (e) { log('callback error', e.message) }
  }))
  on(CB.LobbyChatUpdate, v => {
    if (lobby && v.lobby === lobby.id) {
      log('lobby member', v.user_changed.toString(), 'state', v.member_state_change)
      refreshMembers(true); acceptMembers(); emitLobbySoon()
    }
  })
  on(CB.LobbyDataUpdate, v => { if (lobby && v.lobby === lobby.id) emitLobbySoon() })
  on(CB.PersonaStateChange, v => {
    const id = v.steam_id.toString()
    if (lobby && memberCache.has(id)) { avatarCache.delete(id); emitLobbySoon() }
  })
  on(CB.P2PSessionRequest, v => onSessionRequest(v.remote))
  on(CB.P2PSessionConnectFail, v => {
    const id = v.remote.toString()
    log('P2P connect fail', id, 'error', v.error)
    emit('steam:p2pfail', id, v.error)
  })
  on(CB.GameLobbyJoinRequested, v => {
    log('join requested', v.lobby_steam_id.toString())
    emit('steam:joinRequest', v.lobby_steam_id.toString())
  })
  pollTimer = setInterval(poll, 4)
  // re-accept sessions with lobby members periodically: if a session broke
  // and the request callback was missed, their packets would wait forever
  acceptTimer = setInterval(acceptMembers, 2000)
  log('init ok', me.toString(), myName, 'ffi', !!ffi)
  return status()
}

function status () {
  return {
    ok: !!client,
    error: initError,
    id: me ? me.toString() : null,
    name: myName,
    avatar: me ? avatarOf(me) : null,
    ffi: !!ffi,
    appId: APP_ID
  }
}

function personaOf (id) {
  if (!ffi) return null
  try {
    const n = ffi.persona(ffi.friends, BigInt(id))
    if (!n || n === '[unknown]') { ffi.reqInfo(ffi.friends, BigInt(id), false); return null }
    return n
  } catch (e) { return null }
}

function avatarOf (id) {
  const key = id.toString()
  if (avatarCache.has(key)) return avatarCache.get(key)
  if (!ffi) return null
  try {
    const h = ffi.avatar(ffi.friends, BigInt(id))
    if (h <= 0) { if (h === 0) ffi.reqInfo(ffi.friends, BigInt(id), false); return null }
    const w = [0]; const hh = [0]
    if (!ffi.imgSize(ffi.utils, h, w, hh) || !w[0]) return null
    const size = w[0] * hh[0] * 4
    const buf = Buffer.alloc(size)
    if (!ffi.imgRGBA(ffi.utils, h, buf, size)) return null
    for (let i = 0; i < size; i += 4) { const r = buf[i]; buf[i] = buf[i + 2]; buf[i + 2] = r }
    const { nativeImage } = require('electron')
    const url = nativeImage.createFromBitmap(buf, { width: w[0], height: hh[0] }).toDataURL()
    avatarCache.set(key, url)
    return url
  } catch (e) { return null }
}

function sessionInfo (id) {
  if (!ffi) return null
  try {
    const st = {}
    if (!ffi.sessionState(ffi.net, BigInt(id), st)) return { active: false }
    return {
      active: !!st.bConnectionActive,
      connecting: !!st.bConnecting,
      relay: !!st.bUsingRelay,
      error: st.eP2PSessionError,
      queuedBytes: st.nBytesQueuedForSend,
      queuedPackets: st.nPacketsQueuedForSend
    }
  } catch (e) { return null }
}

function refreshMembers (force) {
  if (!lobby) { memberCache = new Set(); return }
  const now = Date.now()
  if (!force && now - memberRefreshAt < 200) return
  memberRefreshAt = now
  try {
    const list = lobby.getMembers().map(m => m.steamId64.toString())
    if (list.length) memberCache = new Set(list)
  } catch (e) {}
}

function isMember (id) {
  if (!lobby) return false
  if (memberCache.has(id)) return true
  refreshMembers(false)
  return memberCache.has(id)
}

function acceptMembers () {
  if (!client || !lobby) return
  for (const id of memberCache) {
    if (me && id === me.toString()) continue
    try { client.networking.acceptP2PSession(BigInt(id)) } catch (e) {}
  }
}

function onSessionRequest (remote) {
  const id = remote.toString()
  log('P2P session request from', id)
  if (isMember(id)) { client.networking.acceptP2PSession(remote); return }
  let tries = 0
  const t = setInterval(() => {
    refreshMembers(true)
    if (isMember(id)) { client.networking.acceptP2PSession(remote); clearInterval(t) } else if (++tries > 20) { log('session request ignored (not a member)', id); clearInterval(t) }
  }, 250)
}

function lobbyState () {
  if (!lobby) return null
  try {
    const members = lobby.getMembers().map(m => m.steamId64)
    return {
      id: lobby.id.toString(),
      owner: lobby.getOwner().steamId64.toString(),
      me: me.toString(),
      max: Number(lobby.getMemberLimit() || 0),
      type: lobby.getData('type') || '',
      members: members.map(id => ({ id: id.toString(), name: personaOf(id), avatar: avatarOf(id) }))
    }
  } catch (e) {
    return null
  }
}

function emitLobbySoon () {
  if (emitTimer) return
  emitTimer = setTimeout(() => { emitTimer = null; emit('steam:lobby', lobbyState()) }, 30)
}

function resetPeers () {
  outQueues.clear()
  chunks.clear()
  recvChains.clear()
}

function leaveLobby () {
  if (lobby) {
    log('leave lobby', lobby.id.toString())
    try { lobby.leave() } catch (e) {}
    lobby = null
    memberCache = new Set()
    resetPeers()
    try { client.localplayer.setRichPresence('status', null) } catch (e) {}
  }
  emit('steam:lobby', null)
}

async function createLobby (type, max) {
  if (!client) return { ok: false, error: 'Steam не подключен' }
  leaveLobby()
  try {
    lobby = await client.matchmaking.createLobby(type, max)
    lobby.mergeFullData({ [LOBBY_KEY]: '1', ver: PROTO, host: myName, type: String(type) })
    refreshMembers(true)
    try { client.localplayer.setRichPresence('status', 'Рисует в Paint') } catch (e) {}
    log('lobby created', lobby.id.toString(), 'type', type)
    return { ok: true, state: lobbyState() }
  } catch (e) {
    lobby = null
    return { ok: false, error: 'Не удалось создать лобби: ' + String((e && e.message) || e) }
  }
}

async function joinLobby (idStr) {
  if (!client) return { ok: false, error: 'Steam не подключен' }
  let id
  try { id = BigInt(String(idStr).trim()) } catch (e) { return { ok: false, error: 'Неверный код лобби' } }
  leaveLobby()
  try {
    lobby = await client.matchmaking.joinLobby(id)
  } catch (e) {
    lobby = null
    return { ok: false, error: 'Не удалось войти в лобби: ' + String((e && e.message) || e) }
  }
  if (lobby.getData(LOBBY_KEY) !== '1') {
    leaveLobby()
    return { ok: false, error: 'Это лобби не от Paint (обычное лобби Spacewar).' }
  }
  if (lobby.getData('ver') !== PROTO) {
    leaveLobby()
    return { ok: false, error: 'У хоста другая версия Paint. Обновитесь оба до одной версии.' }
  }
  refreshMembers(true)
  acceptMembers()
  try { client.localplayer.setRichPresence('status', 'Рисует в Paint') } catch (e) {}
  log('joined lobby', lobby.id.toString())
  return { ok: true, state: lobbyState() }
}

async function listLobbies () {
  if (!client) return { ok: false, error: 'Steam не подключен' }
  try {
    if (ffi) {
      ffi.addDist(ffi.mm, 3) // k_ELobbyDistanceFilterWorldwide
      ffi.addStr(ffi.mm, LOBBY_KEY, '1', 0)
      ffi.addCount(ffi.mm, 100)
    }
    const list = await client.matchmaking.getLobbies()
    const out = []
    for (const l of list) {
      if (l.getData(LOBBY_KEY) !== '1') continue
      out.push({
        id: l.id.toString(),
        host: l.getData('host') || '?',
        ver: l.getData('ver'),
        members: Number(l.getMemberCount()),
        max: Number(l.getMemberLimit() || 0)
      })
    }
    return { ok: true, lobbies: out, filtered: !!ffi }
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) }
  }
}

function invite () {
  if (!client || !lobby) return false
  try { client.overlay.activateInviteDialog(lobby.id); return true } catch (e) { return false }
}

function openFriends () {
  if (!client) return false
  try { client.overlay.activateDialog(0); return true } catch (e) { return false }
}

// ---- framing: [kind][payload]; big reliable messages are deflated and cut into chunks
function buildPackets (body, kind, msgId) {
  if (body.length + 1 <= CHUNK_SIZE) return [Buffer.concat([Buffer.from([kind]), body])]
  const total = Math.ceil(body.length / CHUNK_SIZE)
  const packets = []
  for (let i = 0; i < total; i++) {
    const h = Buffer.alloc(10)
    h[0] = KIND_CHUNK; h[1] = kind
    h.writeUInt32LE(msgId >>> 0, 2); h.writeUInt16LE(i, 6); h.writeUInt16LE(total, 8)
    packets.push(Buffer.concat([h, body.subarray(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)]))
  }
  return packets
}

async function encodeFrames (text, reliable, msgId) {
  const raw = Buffer.from(text, 'utf8')
  if (!reliable && raw.length <= 1100) return { type: SEND_UNRELIABLE, packets: [Buffer.concat([Buffer.from([KIND_RAW]), raw])] }
  if (raw.length <= 600) return { type: SEND_RELIABLE, packets: buildPackets(raw, KIND_PLAIN, msgId) }
  const body = raw.length >= ASYNC_ZLIB_MIN ? await deflateRaw(raw, { level: 1 }) : zlib.deflateRawSync(raw, { level: 3 })
  return { type: SEND_RELIABLE, packets: buildPackets(body, KIND_DEFLATE, msgId) }
}

// returns the decoded text when a message is complete, otherwise null
async function decodeFrame (store, from, buf, onProgress) {
  const kind = buf[0]
  if (kind === KIND_RAW || kind === KIND_PLAIN) return buf.subarray(1).toString('utf8')
  if (kind === KIND_DEFLATE) {
    const body = buf.subarray(1)
    return (body.length >= ASYNC_ZLIB_MIN / 4 ? await inflateRaw(body) : zlib.inflateRawSync(body)).toString('utf8')
  }
  if (kind !== KIND_CHUNK) return null
  const inner = buf[1]
  const id = buf.readUInt32LE(2)
  const idx = buf.readUInt16LE(6)
  const total = buf.readUInt16LE(8)
  const key = from + ':' + id
  let c = store.get(key)
  if (!c) { c = { parts: new Array(total), got: 0, t: Date.now() }; store.set(key, c) }
  if (!c.parts[idx]) { c.parts[idx] = Buffer.from(buf.subarray(10)); c.got++ }
  if (onProgress) onProgress(c.got, total)
  if (c.got < total) return null
  store.delete(key)
  let body = Buffer.concat(c.parts)
  if (inner === KIND_DEFLATE) body = await inflateRaw(body)
  return body.toString('utf8')
}

function send (targets, text, reliable) {
  if (!client || !lobby) return
  targets = targets.filter(t => !(me && t === me.toString()))
  if (!targets.length) return
  const id = msgCounter++
  if (!reliable && Buffer.byteLength(text, 'utf8') <= 1100) {
    // unreliable small packets (cursor, ping) skip the queue entirely
    const p = Buffer.concat([Buffer.from([KIND_RAW]), Buffer.from(text, 'utf8')])
    for (const t of targets) {
      const q = outQueues.get(t)
      if (!q || !q.length) { try { client.networking.sendP2PPacket(BigInt(t), SEND_UNRELIABLE, p) } catch (e) {} }
    }
    return
  }
  // one chain for all reliable sends: async compression never reorders messages
  sendChain = sendChain.then(async () => {
    const { packets } = await encodeFrames(text, true, id)
    for (const t of targets) {
      let q = outQueues.get(t)
      if (!q) { q = []; outQueues.set(t, q) }
      for (const p of packets) q.push({ p, tries: 0 })
    }
    flushOut()
  }).catch(e => log('send error', e.message))
}

// one FIFO per peer, so a slow or vanished peer never blocks the others
function flushOut () {
  if (!client) return
  for (const [t, q] of outQueues) {
    if (!isMember(t)) { log('drop queue for non-member', t, q.length); outQueues.delete(t); continue }
    const id = BigInt(t)
    while (q.length) {
      let ok = false
      try { ok = client.networking.sendP2PPacket(id, SEND_RELIABLE, q[0].p) } catch (e) { ok = true }
      if (!ok) {
        const tries = ++q[0].tries
        if (tries === 250) log('send stalled to', t, 'queue', q.length, JSON.stringify(sessionInfo(t)))
        if (tries > 7500) { log('give up packet to', t); q.shift() }
        break
      }
      q.shift()
    }
    if (!q.length) outQueues.delete(t)
  }
}

// "a packet is waiting" followed by "no packet" means another process of
// this Steam account took it (a second Paint, or another AppID 480 game).
let readFails = 0
let readFailSince = 0
let stealWarned = false
function noteReadFail () {
  const now = Date.now()
  if (now - readFailSince > 10000) {
    if (readFails) log('P2P read failed', readFails, 'times in 10s: another program is reading our packets')
    readFailSince = now
    readFails = 0
  }
  if (++readFails >= 5 && !stealWarned) {
    stealWarned = true
    log('packets are being taken by another process')
    emit('steam:warn', 'steal')
  }
}

function poll () {
  if (!client) return
  if (outQueues.size) flushOut()
  let n = 0
  let size
  try {
    while ((size = client.networking.isP2PPacketAvailable()) > 0 && n++ < 400) {
      let p
      try { p = client.networking.readP2PPacket(size) } catch (e) { noteReadFail(); break }
      handlePacket(p.steamId.steamId64.toString(), p.data)
    }
  } catch (e) { log('poll error', e.message) }
  if (chunks.size) {
    const now = Date.now()
    for (const [k, c] of chunks) if (now - c.t > 120000) { log('drop incomplete message', k, c.got + '/' + c.parts.length); chunks.delete(k) }
  }
}

function handlePacket (from, buf) {
  if (!buf || !buf.length) return
  if (!isMember(from)) {
    const now = Date.now()
    if (now - (dropLoggedAt.get(from) || 0) > 5000) { dropLoggedAt.set(from, now); log('drop packet from non-member', from) }
    return
  }
  // decode in order per sender (big parts inflate off the main thread)
  const prev = recvChains.get(from) || Promise.resolve()
  const next = prev.then(async () => {
    const text = await decodeFrame(chunks, from, buf, (got, total) => { if (total > 1) emit('steam:progress', from, got, total) })
    if (text != null) emit('steam:packet', from, text)
  }).catch(e => log('bad packet from', from, e.message))
  recvChains.set(from, next)
}

function diagnostics () {
  if (!lobby) return null
  const out = {}
  for (const id of memberCache) {
    if (me && id === me.toString()) continue
    out[id] = Object.assign({ queue: (outQueues.get(id) || []).length }, sessionInfo(id) || {})
  }
  return out
}

function shutdown () {
  leaveLobby()
  if (pollTimer) clearInterval(pollTimer)
  if (acceptTimer) clearInterval(acceptTimer)
}

module.exports = {
  enableOverlay, setWindow, setLogger, init, status, createLobby, joinLobby, leaveLobby,
  listLobbies, invite, openFriends, send, shutdown, lobbyState, diagnostics,
  _test: { encodeFrames, decodeFrame }
}
