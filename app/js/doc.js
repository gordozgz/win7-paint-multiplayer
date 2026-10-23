'use strict';
// Document = main canvas + ordered op log with per-op undo flags.
// Undo of any op = restore nearest checkpoint before it and replay the rest.
(function (P) {
  const U = P.util
  const R = P.raster

  const MAX_OPS = 120
  const CP_BUDGET = 320 * 1024 * 1024

  const D = P.doc = U.emitter({})

  // Undo reaches only the last UNDO_WINDOW ops. Guests keep twice as many ops
  // as the host (keepOps), so anything the host can still undo is present on
  // every guest, even though they fold old history at different moments.
  D.UNDO_WINDOW = 100
  D.keepOps = MAX_OPS

  D.init = function (canvas) {
    D.canvas = canvas
    D.ctx = canvas.getContext('2d', { willReadFrequently: true })
    D.ops = []
    D.cps = new Map()
    D.base = null
    D.baseURL = null
    D.reset(1152, 648)
  }

  D.width = () => D.canvas.width
  D.height = () => D.canvas.height

  D.setSize = function (w, h) {
    w = U.clamp(w | 0, 1, 20000); h = U.clamp(h | 0, 1, 20000)
    if (D.canvas.width !== w || D.canvas.height !== h) {
      D.canvas.width = w; D.canvas.height = h
      D.emit('resize', w, h)
    }
  }

  D.reset = function (w, h, img) {
    D.setSize(w, h)
    D.ctx.fillStyle = '#fff'
    D.ctx.fillRect(0, 0, w, h)
    if (img) D.ctx.drawImage(img, 0, 0)
    D.ops = []
    D.cps.clear()
    D.base = D.snapshot()
    D.baseURL = null
    D.emit('change', { reset: true })
  }

  D.snapshot = () => ({ w: D.canvas.width, h: D.canvas.height, data: D.ctx.getImageData(0, 0, D.canvas.width, D.canvas.height) })

  D.restore = function (s) {
    D.setSize(s.w, s.h)
    D.ctx.putImageData(s.data, 0, 0)
  }

  function cpEvery () {
    const bytes = D.canvas.width * D.canvas.height * 4
    const allowed = Math.max(2, Math.floor(CP_BUDGET / bytes))
    return Math.max(8, Math.ceil(D.keepOps / allowed))
  }

  // Decode images an op needs, before it can be applied synchronously.
  // Always decode from the data URL (even our own ops), so every peer
  // draws exactly the same pixels.
  D.prepare = async function (op) {
    if (op.img && !op._dec) { op._img = await U.loadImage(op.img); op._dec = true }
  }

  function applyOp (op) {
    const ctx = D.ctx
    ctx.save()
    try {
      switch (op.t) {
        case 'stroke': R.drawStroke(ctx, op, 0, ctx); break
        case 'shape': R.drawShape(ctx, op); break
        case 'fill': R.floodFill(ctx, ctx, op.x, op.y, op.c); break
        case 'stamp': R.drawStamp(ctx, op); break
        case 'invert': R.invertRegion(ctx, op.region || null); break
        case 'canvas': applyCanvas(op); break
        case 'crop': applyCrop(op); break
        case 'xform': applyXform(op); break
        case 'scale': applyScale(op); break
        case 'load': applyLoad(op); break
      }
    } catch (e) {
      console.error('op failed', op.t, e)
    }
    ctx.restore()
  }

  // Canvases used while applying ops are CPU-backed (willReadFrequently), so
  // results don't depend on the player's GPU.
  function copyCanvas () {
    const c = U.canvas(D.canvas.width, D.canvas.height)
    c.getContext('2d', { willReadFrequently: true }).drawImage(D.canvas, 0, 0)
    return c
  }

  function applyCanvas (op) {
    const old = copyCanvas()
    D.setSize(op.w, op.h)
    const ctx = D.ctx
    ctx.fillStyle = U.css(op.c || [255, 255, 255])
    ctx.fillRect(0, 0, op.w, op.h)
    ctx.drawImage(old, 0, 0)
  }

  function applyCrop (op) {
    const W = D.canvas.width; const H = D.canvas.height
    const r = R.regionMask(op.region, W, H)
    if (!r) return
    const img = D.ctx.getImageData(r.x, r.y, r.w, r.h)
    if (r.m) {
      for (let i = 0; i < r.m.length; i++) {
        if (!r.m[i]) { const k = i * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = img.data[k + 3] = 255 }
      }
    }
    D.setSize(r.w, r.h)
    D.ctx.putImageData(img, 0, 0)
  }

  function applyXform (op) {
    const old = copyCanvas()
    const w = old.width; const h = old.height
    const rot = op.k === 'r90' || op.k === 'l90'
    D.setSize(rot ? h : w, rot ? w : h)
    const ctx = D.ctx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    if (op.k === 'r90') ctx.setTransform(0, 1, -1, 0, h, 0)
    else if (op.k === 'l90') ctx.setTransform(0, -1, 1, 0, 0, w)
    else if (op.k === '180') ctx.setTransform(-1, 0, 0, -1, w, h)
    else if (op.k === 'fh') ctx.setTransform(-1, 0, 0, 1, w, 0)
    else if (op.k === 'fv') ctx.setTransform(1, 0, 0, -1, 0, h)
    ctx.drawImage(old, 0, 0)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }

  R.skewCanvas = function (src, w, h, ax, ay, bg) {
    const tx = Math.tan((ax * Math.PI) / 180); const ty = Math.tan((ay * Math.PI) / 180)
    const W2 = Math.max(1, Math.round(w + Math.abs(tx) * h)); const H2 = Math.max(1, Math.round(h + Math.abs(ty) * w))
    const out = U.canvas(W2, H2)
    const ctx = out.getContext('2d', { willReadFrequently: true })
    if (bg) { ctx.fillStyle = U.css(bg); ctx.fillRect(0, 0, W2, H2) }
    const ox = tx < 0 ? -tx * h : 0; const oy = ty < 0 ? -ty * w : 0
    ctx.setTransform(1, ty, tx, 1, ox, oy)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(src, 0, 0, w, h)
    return out
  }

  function applyScale (op) {
    const old = copyCanvas()
    const out = R.skewCanvas(old, op.w, op.h, op.ax || 0, op.ay || 0, op.c || [255, 255, 255])
    D.setSize(out.width, out.height)
    D.ctx.drawImage(out, 0, 0)
  }

  function applyLoad (op) {
    const w = op.w || op._img.width; const h = op.h || op._img.height
    D.setSize(w, h)
    D.ctx.fillStyle = '#fff'
    D.ctx.fillRect(0, 0, w, h)
    if (op._img) D.ctx.drawImage(op._img, 0, 0)
  }

  // Apply a sequenced op (or undo/redo meta op).
  D.commit = function (op) {
    if (op.t === 'undo' || op.t === 'redo') {
      D.setUndone(op.target, op.t === 'undo')
      D.emit('change', { op })
      return
    }
    if (op.t === 'load') {
      applyOp(op)
      D.ops = []
      D.cps.clear()
      D.base = D.snapshot()
      D.baseURL = null
      D.emit('change', { op, reset: true })
      return
    }
    op.undone = !!op.undone
    D.ops.push(op)
    if (!op.undone) applyOp(op)
    const i = D.ops.length - 1
    if ((i + 1) % cpEvery() === 0) D.cps.set(i, D.snapshot())
    trim()
    D.emit('change', { op })
  }

  function trim () {
    const keep = D.keepOps
    if (D.ops.length <= keep) return
    const limit = D.ops.length - keep - 1
    let k = -1
    for (const key of D.cps.keys()) if (key <= limit && key > k) k = key
    if (k < 0) return
    D.base = D.cps.get(k)
    D.baseURL = null
    D.ops.splice(0, k + 1)
    const next = new Map()
    for (const [key, v] of D.cps) if (key > k) next.set(key - (k + 1), v)
    D.cps = next
  }

  D.findOp = id => D.ops.findIndex(o => o.id === id)

  D.setUndone = function (id, flag) {
    const idx = D.findOp(id)
    if (idx < 0) return false
    if (D.ops[idx].undone === flag) return false
    D.ops[idx].undone = flag
    D.rebuild(idx)
    return true
  }

  D.rebuild = function (from) {
    for (const k of Array.from(D.cps.keys())) if (k >= from) D.cps.delete(k)
    let start = -1; let state = D.base
    for (const [k, v] of D.cps) if (k < from && k > start) { start = k; state = v }
    D.restore(state)
    const every = cpEvery()
    for (let i = start + 1; i < D.ops.length; i++) {
      if (!D.ops[i].undone) applyOp(D.ops[i])
      if ((i + 1) % every === 0) D.cps.set(i, D.snapshot())
    }
  }

  D.hash = function () {
    const w = D.canvas.width; const h = D.canvas.height
    return w + 'x' + h + ':' + U.fnv(D.ctx.getImageData(0, 0, w, h).data)
  }

  // PNG data URL; toBlob encodes off the main thread (the pixels are taken
  // at call time, so later drawing doesn't leak into the snapshot)
  function canvasURL (c) {
    return new Promise((resolve, reject) => {
      c.toBlob(b => {
        if (!b) return reject(new Error('encode failed'))
        const fr = new FileReader()
        fr.onload = () => resolve(fr.result)
        fr.onerror = () => reject(fr.error)
        fr.readAsDataURL(b)
      }, 'image/png')
    })
  }
  function stateCanvas (s) {
    const c = U.canvas(s.w, s.h)
    c.getContext('2d', { willReadFrequently: true }).putImageData(s.data, 0, 0)
    return c
  }

  // withCur: also send the exact current pixels — the receiver shows them as
  // is (no replay needed, and rendering differences can't creep in)
  D.exportStateAsync = async function (withCur) {
    // capture everything synchronously: ops keep changing while we encode
    const base = D.base
    const ops = D.ops.map(o => Object.assign({}, o))
    const curP = withCur && ops.length ? canvasURL(D.canvas) : null
    let baseURL = base === D.base ? D.baseURL : null
    if (!baseURL) {
      baseURL = await canvasURL(stateCanvas(base))
      if (base === D.base) D.baseURL = baseURL
    }
    return {
      base: { w: base.w, h: base.h, img: baseURL },
      ops,
      cur: curP ? await curP : null
    }
  }

  D.importState = async function (state) {
    const baseImg = await U.loadImage(state.base.img)
    const curImg = state.cur ? await U.loadImage(state.cur) : null
    const ops = state.ops || []
    for (const op of ops) await D.prepare(op)
    D.setSize(state.base.w, state.base.h)
    D.ctx.fillStyle = '#fff'
    D.ctx.fillRect(0, 0, state.base.w, state.base.h)
    D.ctx.drawImage(baseImg, 0, 0)
    D.base = D.snapshot()
    D.baseURL = state.base.img
    D.ops = ops
    D.cps.clear()
    if (curImg && ops.length) {
      // exact pixels from the host; the op list is only kept for undo
      D.setSize(curImg.width, curImg.height)
      D.ctx.fillStyle = '#fff'
      D.ctx.fillRect(0, 0, curImg.width, curImg.height)
      D.ctx.drawImage(curImg, 0, 0)
      D.cps.set(ops.length - 1, D.snapshot())
    } else {
      D.rebuild(0)
    }
    D.emit('change', { reset: true, imported: true })
  }

  // A composited copy of the image for export
  D.exportCanvas = function () {
    return copyCanvas()
  }
})(window.P)
