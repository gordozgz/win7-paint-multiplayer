'use strict';
// Canvas view: zoom, layers, coordinate mapping, rulers, grid, canvas-resize
// handles, remote players' overlays and cursors.
(function (P) {
  const U = P.util
  const D = P.doc
  const R = P.raster
  const S = P.net
  const $ = U.$

  const V = P.view = U.emitter({ zoom: 1, rulers: false, grid: false })
  V.ZOOMS = [0.125, 0.25, 0.5, 1, 2, 3, 4, 5, 6, 7, 8]

  const remotes = new Map() // peerId -> {canvas, ctx}
  const cursors = new Map() // peerId -> element

  V.init = function () {
    V.ws = $('#workspace')
    V.stage = $('#stage')
    V.wrap = $('#canvasWrap')
    V.main = $('#cvMain')
    V.pendingCv = $('#cvPending')
    V.previewCv = $('#cvPreview')
    V.pctx = V.previewCv.getContext('2d', { willReadFrequently: true })
    V.qctx = V.pendingCv.getContext('2d', { willReadFrequently: true })
    V.ui = $('#uiLayer')
    V.curLayer = $('#cursorLayer')
    V.remoteBox = $('#remoteLayers')
    V.gridEl = $('#grid')
    V.ghost = $('#resizeGhost')
    V.handles = U.$$('.cv-handle')

    D.on('resize', () => V.syncSize())
    V.ws.addEventListener('scroll', () => { V.drawRulers(); V.emit('scroll') })
    window.addEventListener('resize', () => V.drawRulers())
    initHandles()

    S.on('pending', V.renderPending)
    S.on('live', onLive)
    S.on('cursor', onCursor)
    S.on('peerLeft', p => {
      const r = remotes.get(p.id); if (r) { r.canvas.remove(); remotes.delete(p.id) }
      const c = cursors.get(p.id); if (c) { c.remove(); cursors.delete(p.id) }
    })
    S.on('peers', () => { for (const [id, el] of cursors) { const p = S.peers.get(id); if (p) styleCursor(el, p) } })
    setInterval(() => {
      const now = Date.now()
      for (const [id, el] of cursors) {
        const p = S.peers.get(id)
        el.style.display = (!p || !p.cursor || now - p.cursor.t > 15000 || p.cursor.x < 0 || !S.showCursors) ? 'none' : ''
      }
    }, 1000)
    V.syncSize()
  }

  V.syncSize = function () {
    const w = D.width(); const h = D.height()
    const cvs = [V.pendingCv, V.previewCv]
    for (const r of remotes.values()) cvs.push(r.canvas)
    for (const c of cvs) if (c.width !== w || c.height !== h) { c.width = w; c.height = h }
    V.applyZoom()
    V.renderPending()
    for (const [id] of remotes) { const p = S.peers.get(id); if (p) drawLive(p, true) }
    V.emit('resize')
  }

  V.applyZoom = function () {
    const z = V.zoom; const w = D.width(); const h = D.height()
    const cw = Math.max(1, Math.round(w * z)); const ch = Math.max(1, Math.round(h * z))
    V.cw = cw; V.ch = ch
    V.wrap.style.width = cw + 'px'
    V.wrap.style.height = ch + 'px'
    const cvs = [V.main, V.pendingCv, V.previewCv]
    for (const r of remotes.values()) cvs.push(r.canvas)
    for (const c of cvs) { c.style.width = cw + 'px'; c.style.height = ch + 'px' }
    V.wrap.classList.toggle('smooth', z < 1)
    const [hr, hb, hrb] = V.handles
    hr.style.left = (5 + cw) + 'px'; hr.style.top = (5 + ch / 2 - 2) + 'px'
    hb.style.left = (5 + cw / 2 - 2) + 'px'; hb.style.top = (5 + ch) + 'px'
    hrb.style.left = (5 + cw) + 'px'; hrb.style.top = (5 + ch) + 'px'
    V.updateGrid()
    for (const [id, el] of cursors) { const p = S.peers.get(id); if (p && p.cursor) placeCursor(el, p.cursor) }
    V.drawRulers()
    V.emit('zoom')
  }

  V.setZoom = function (z, clientX, clientY) {
    z = U.clamp(z, 0.125, 8)
    if (z === V.zoom) return
    const r = V.ws.getBoundingClientRect()
    if (clientX == null) { clientX = r.left + Math.min(r.width / 2, V.cw / 2); clientY = r.top + Math.min(r.height / 2, V.ch / 2) }
    const before = V.clientToImage(clientX, clientY)
    V.zoom = z
    V.applyZoom()
    const wr = V.main.getBoundingClientRect()
    V.ws.scrollLeft += (wr.left + before.fx * z) - clientX
    V.ws.scrollTop += (wr.top + before.fy * z) - clientY
    V.drawRulers()
    V.emit('zoomChanged')
  }

  V.zoomStep = function (dir, cx, cy) {
    const z = V.zoom
    let next
    if (dir > 0) next = V.ZOOMS.find(v => v > z + 1e-6)
    else next = V.ZOOMS.slice().reverse().find(v => v < z - 1e-6)
    if (next) V.setZoom(next, cx, cy)
  }

  V.clientToImage = function (cx, cy) {
    const r = V.main.getBoundingClientRect()
    const fx = (cx - r.left) / V.zoom; const fy = (cy - r.top) / V.zoom
    return { x: Math.floor(fx), y: Math.floor(fy), fx, fy }
  }

  V.imageToClient = function (x, y) {
    const r = V.main.getBoundingClientRect()
    return { x: r.left + x * V.zoom, y: r.top + y * V.zoom }
  }

  // visible image area (for paste placement)
  V.visibleOrigin = function () {
    const r = V.main.getBoundingClientRect(); const w = V.ws.getBoundingClientRect()
    return {
      x: Math.max(0, Math.floor((w.left - r.left) / V.zoom)),
      y: Math.max(0, Math.floor((w.top - r.top) / V.zoom))
    }
  }

  V.clearPreview = () => V.pctx.clearRect(0, 0, V.previewCv.width, V.previewCv.height)

  V.renderPending = function () {
    V.qctx.clearRect(0, 0, V.pendingCv.width, V.pendingCv.height)
    const undone = S.localFlags()
    for (const op of S.pending.values()) {
      if (op.t === 'undo' || op.t === 'redo' || undone.get(op.id)) continue
      V.qctx.save()
      try { R.drawPreview(V.qctx, op, D.ctx) } catch (e) { console.warn(e) }
      V.qctx.restore()
    }
  }

  // ---------- remote layers ----------
  function remote (id) {
    let r = remotes.get(id)
    if (!r) {
      const c = U.canvas(D.width(), D.height())
      c.style.width = V.cw + 'px'; c.style.height = V.ch + 'px'
      V.remoteBox.appendChild(c)
      r = { canvas: c, ctx: c.getContext('2d', { willReadFrequently: true }) }
      remotes.set(id, r)
    }
    return r
  }

  // Remote strokes in progress: packets can arrive in bursts, so drawing is
  // batched to one pass per animation frame.
  const liveDirty = new Map()
  let liveRaf = 0
  function onLive (peer, reset) {
    liveDirty.set(peer.id, !!(liveDirty.get(peer.id) || reset))
    if (!liveRaf) liveRaf = requestAnimationFrame(flushLive)
  }
  function flushLive () {
    liveRaf = 0
    for (const [id, reset] of liveDirty) { const p = S.peers.get(id); if (p) drawLive(p, reset) }
    liveDirty.clear()
  }

  function drawLive (peer, reset) {
    const r = remote(peer.id)
    const ctx = r.ctx
    const L = peer.live
    const clear = () => ctx.clearRect(0, 0, r.canvas.width, r.canvas.height)
    if (!L || !S.liveEnabled) { clear(); r.drawn = null; return }
    ctx.save()
    try {
      if (L.vector) {
        clear()
        r.drawn = null
        if (L.op.t === 'shape') R.drawShape(ctx, L.op)
      } else if (L.op.t === 'stroke') {
        const full = R.isFull(L.op)
        if (reset || full || !r.drawn || r.drawn.live !== L) { clear(); r.drawn = { live: L, run: 0, pts: 0 } }
        const d = r.drawn
        // each run is a contiguous piece; lost chunks start a new run (no straight jump)
        for (let ri = full ? 0 : d.run; ri < L.runs.length; ri++) {
          const run = L.runs[ri]
          const from = !full && ri === d.run ? d.pts : 0
          if ((run.length >> 1) > from) R.drawStroke(ctx, Object.assign({}, L.op, { p: run }), from, D.ctx)
          d.run = ri
          d.pts = run.length >> 1
        }
      }
    } catch (e) { console.warn(e) }
    ctx.restore()
  }

  // ---------- remote cursors ----------
  function styleCursor (el, p) {
    el.querySelector('.rarrow').innerHTML = P.icons.cursorArrow(p.color)
    const n = el.querySelector('.rname')
    n.textContent = p.name
    n.style.background = p.color
    el.classList.toggle('noname', !S.showNames)
  }
  function placeCursor (el, c) {
    el.style.transform = 'translate(' + Math.round((c.x + 0.5) * V.zoom) + 'px,' + Math.round((c.y + 0.5) * V.zoom) + 'px)'
  }
  function onCursor (p) {
    let el = cursors.get(p.id)
    if (!el) {
      el = U.h('div.rcursor', null, U.h('div.rarrow'), U.h('div.rname'))
      V.curLayer.appendChild(el)
      cursors.set(p.id, el)
      styleCursor(el, p)
    }
    if (!S.showCursors || p.cursor.x < 0) { el.style.display = 'none'; return }
    el.style.display = ''
    placeCursor(el, p.cursor)
  }
  V.refreshCursors = function () {
    for (const [id, el] of cursors) {
      const p = S.peers.get(id)
      if (p) { styleCursor(el, p); if (p.cursor) onCursor(p) }
    }
  }

  // ---------- canvas resize handles ----------
  function initHandles () {
    for (const h of V.handles) {
      h.addEventListener('pointerdown', e => {
        if (e.button !== 0) return
        e.preventDefault(); e.stopPropagation()
        P.tools.commitAll()
        h.setPointerCapture(e.pointerId)
        const kind = h.dataset.h
        let nw = D.width(); let nh = D.height()
        V.ghost.classList.remove('hidden')
        const upd = ev => {
          const r = V.main.getBoundingClientRect()
          if (kind !== 'b') nw = Math.max(1, Math.round((ev.clientX - r.left) / V.zoom))
          if (kind !== 'r') nh = Math.max(1, Math.round((ev.clientY - r.top) / V.zoom))
          V.ghost.style.width = Math.round(nw * V.zoom) + 'px'
          V.ghost.style.height = Math.round(nh * V.zoom) + 'px'
          V.emit('ghost', nw, nh)
        }
        upd(e)
        const move = ev => upd(ev)
        const up = ev => {
          h.removeEventListener('pointermove', move)
          h.removeEventListener('pointerup', up)
          h.removeEventListener('pointercancel', up)
          V.ghost.classList.add('hidden')
          V.emit('ghost', null)
          if (nw !== D.width() || nh !== D.height()) {
            S.submit({ t: 'canvas', w: nw, h: nh, c: P.app.color2.slice() })
          }
        }
        h.addEventListener('pointermove', move)
        h.addEventListener('pointerup', up)
        h.addEventListener('pointercancel', up)
      })
    }
  }

  // ---------- grid & rulers ----------
  V.updateGrid = function () {
    const show = V.grid && V.zoom >= 2
    V.gridEl.classList.toggle('hidden', !show)
    if (!show) return
    const z = V.zoom
    const col = 'rgba(128,128,128,0.55)'
    V.gridEl.style.backgroundImage = 'linear-gradient(to right, ' + col + ' 1px, transparent 1px), linear-gradient(to bottom, ' + col + ' 1px, transparent 1px)'
    V.gridEl.style.backgroundSize = z + 'px ' + z + 'px'
  }

  V.setRulers = function (on) {
    V.rulers = on
    $('#main').classList.toggle('rulers', on)
    for (const id of ['#rulerH', '#rulerV', '#rulerCorner']) $(id).classList.toggle('hidden', !on)
    V.drawRulers()
  }

  V.drawRulers = function () {
    if (!V.rulers) return
    const z = V.zoom
    const mr = V.main.getBoundingClientRect()
    const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000]
    const minor = steps.find(s => s * z >= 6) || 5000
    const major = steps.find(s => s * z >= 60 && s % minor === 0) || minor * 10
    const draw = (cv, horiz) => {
      const rr = cv.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const W = Math.round(rr.width * dpr); const H = Math.round(rr.height * dpr)
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H }
      const ctx = cv.getContext('2d')
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, rr.width, rr.height)
      ctx.strokeStyle = '#8a8a8a'; ctx.fillStyle = '#555'; ctx.font = '10px Segoe UI, Arial'
      ctx.lineWidth = 1
      const origin = horiz ? mr.left - rr.left : mr.top - rr.top
      const len = horiz ? rr.width : rr.height
      const startV = Math.floor(-origin / z / minor) * minor
      ctx.beginPath()
      for (let v = startV; ; v += minor) {
        const pos = Math.round(origin + v * z) + 0.5
        if (pos > len) break
        if (pos < 0) continue
        const isMajor = v % major === 0
        const tl = isMajor ? 18 : (v % (major / 2) === 0 ? 7 : 4)
        if (horiz) { ctx.moveTo(pos, 18); ctx.lineTo(pos, 18 - tl) } else { ctx.moveTo(18, pos); ctx.lineTo(18 - tl, pos) }
        if (isMajor) {
          if (horiz) ctx.fillText(String(v), pos + 2, 9)
          else { ctx.save(); ctx.translate(9, pos + 2); ctx.rotate(Math.PI / 2); ctx.fillText(String(v), 0, 0); ctx.restore() }
        }
      }
      ctx.stroke()
      ctx.strokeStyle = '#c8c8c8'
      ctx.beginPath()
      if (horiz) { ctx.moveTo(0, 17.5); ctx.lineTo(len, 17.5) } else { ctx.moveTo(17.5, 0); ctx.lineTo(17.5, len) }
      ctx.stroke()
    }
    draw($('#rulerH'), true)
    draw($('#rulerV'), false)
  }
})(window.P)
