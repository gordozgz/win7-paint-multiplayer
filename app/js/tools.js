'use strict';
// Tools: pointer interaction -> preview -> op submitted to the session.
(function (P) {
  const U = P.util
  const R = P.raster
  const D = P.doc
  const S = P.net
  const V = P.view
  const T = P.tools = {}
  let A = null

  const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
  const HCURSOR = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' }

  // ------------------------------------------------------------ helpers
  function inCanvas (pt) { return pt.x >= 0 && pt.y >= 0 && pt.x < D.width() && pt.y < D.height() }
  function clampPt (pt) { return { x: U.clamp(pt.x, 0, D.width() - 1), y: U.clamp(pt.y, 0, D.height() - 1) } }
  function handlePos (b, n) {
    const x = n.includes('w') ? b.x : n.includes('e') ? b.x + b.w : b.x + b.w / 2
    const y = n.includes('n') ? b.y : n.includes('s') ? b.y + b.h : b.y + b.h / 2
    return { x, y }
  }
  function hitHandle (e, b, names) {
    for (const n of names || HANDLES) {
      const p = handlePos(b, n); const c = V.imageToClient(p.x, p.y)
      if (Math.abs(e.clientX - c.x) <= 5 && Math.abs(e.clientY - c.y) <= 5) return n
    }
    return null
  }
  function inBox (e, b, pad) {
    const a = V.imageToClient(b.x, b.y); const c = V.imageToClient(b.x + b.w, b.y + b.h)
    pad = pad || 0
    return e.clientX >= a.x - pad && e.clientX <= c.x + pad && e.clientY >= a.y - pad && e.clientY <= c.y + pad
  }
  function applyHandle (o, n, dx, dy) {
    let { x, y, w, h } = o
    if (n.includes('w')) { x = o.x + dx; w = o.w - dx }
    if (n.includes('e')) w = o.w + dx
    if (n.includes('n')) { y = o.y + dy; h = o.h - dy }
    if (n.includes('s')) h = o.h + dy
    if (w < 1) { if (n.includes('w')) x = o.x + o.w - 1; w = 1 }
    if (h < 1) { if (n.includes('n')) y = o.y + o.h - 1; h = 1 }
    return { x, y, w, h }
  }

  // dashed box with 8 handles living in the UI layer
  function makeBox (cls) {
    const el = U.h('div.' + cls)
    const hs = HANDLES.map(() => U.h('div.sel-handle'))
    let visible = false
    return {
      show (b, handles) {
        const z = V.zoom
        if (!visible) { V.ui.appendChild(el); for (const d of hs) V.ui.appendChild(d); visible = true }
        el.style.display = ''
        el.style.left = Math.round(b.x * z) + 'px'; el.style.top = Math.round(b.y * z) + 'px'
        el.style.width = Math.max(1, Math.round(b.w * z)) + 'px'; el.style.height = Math.max(1, Math.round(b.h * z)) + 'px'
        HANDLES.forEach((n, i) => {
          const p = handlePos(b, n)
          hs[i].style.display = handles === false ? 'none' : ''
          hs[i].style.left = Math.round(p.x * z) + 'px'; hs[i].style.top = Math.round(p.y * z) + 'px'
        })
      },
      points (pts) {
        const z = V.zoom
        if (!visible) { V.ui.appendChild(el); for (const d of hs) V.ui.appendChild(d); visible = true }
        el.style.display = 'none'
        hs.forEach((d, i) => {
          if (i < pts.length) { d.style.display = ''; d.style.left = Math.round((pts[i].x + 0.5) * z) + 'px'; d.style.top = Math.round((pts[i].y + 0.5) * z) + 'px' } else d.style.display = 'none'
        })
      },
      hide () { if (!visible) return; el.remove(); for (const d of hs) d.remove(); visible = false }
    }
  }

  function setCursor (c) { if (V.ws.style.cursor !== c) V.ws.style.cursor = c }

  // A fast mouse sends many (coalesced) moves per frame; previews are drawn
  // at most once per frame.
  function frameRenderer (fn) {
    let id = 0
    const run = () => { id = 0; fn() }
    return {
      soon () { if (!id) id = requestAnimationFrame(run) },
      cancel () { if (id) { cancelAnimationFrame(id); id = 0 } }
    }
  }

  // ------------------------------------------------------------ stroke tools
  function StrokeTool (kind) {
    let op = null; let drawn = 0; let timer = null; let last = null
    const render = () => {
      frame.cancel()
      if (!op) return
      if (R.isFull(op)) { V.clearPreview(); R.drawStroke(V.pctx, op, 0, D.ctx) } else { R.drawStroke(V.pctx, op, drawn, D.ctx); drawn = op.p.length >> 1 }
      S.livePoints(op)
    }
    const frame = frameRenderer(render)
    const finish = () => {
      if (!op) return
      clearInterval(timer)
      frame.cancel()
      const o = op; op = null
      S.liveEnd(o)
      V.clearPreview()
      S.submit(o)
    }
    return {
      name: kind,
      busy: () => !!op,
      cursor () { return kind === 'pencil' ? P.cursors.pencil : kind === 'eraser' ? 'none' : P.cursors.brush },
      down (e, pt) {
        if (!inCanvas(pt)) return
        const right = e.button === 2
        op = { t: 'stroke', id: S.newId(), p: [pt.x, pt.y] }
        if (kind === 'pencil') { op.tool = 'pencil'; op.c = (right ? A.color2 : A.color1).slice(); op.s = A.sizes.pencil }
        else if (kind === 'eraser') {
          op.s = A.sizes.eraser
          if (right) { op.tool = 'ceraser'; op.c = A.color2.slice(); op.c1 = A.color1.slice() } else { op.tool = 'eraser'; op.c = A.color2.slice() }
        } else {
          op.tool = 'brush'; op.brush = A.brush; op.c = (right ? A.color2 : A.color1).slice(); op.s = A.sizes.brush; op.seed = U.randSeed()
        }
        this.button = e.button
        drawn = 0; last = pt
        render()
        S.liveStart(op)
        if (op.brush === 'air') timer = setInterval(() => { if (op) { op.p.push(last.x, last.y); render() } }, 45)
      },
      move (e, pt) {
        if (!op) return
        last = pt
        const p = op.p
        if (p[p.length - 2] === pt.x && p[p.length - 1] === pt.y) return
        p.push(pt.x, pt.y)
        frame.soon()
      },
      up () { finish() },
      commit () { finish() },
      cancel () {
        if (!op) return
        clearInterval(timer)
        frame.cancel()
        S.liveCancel(op.id)
        op = null
        V.clearPreview()
      }
    }
  }

  // ------------------------------------------------------------ simple tools
  const FillTool = {
    name: 'fill',
    cursor: () => P.cursors.fill,
    down (e, pt) {
      if (!inCanvas(pt)) return
      S.submit({ t: 'fill', x: pt.x, y: pt.y, c: (e.button === 2 ? A.color2 : A.color1).slice() })
    }
  }

  const PickerTool = {
    name: 'picker',
    cursor: () => P.cursors.picker,
    down (e, pt) {
      if (!inCanvas(pt)) return
      const d = D.ctx.getImageData(pt.x, pt.y, 1, 1).data
      A.setColor(e.button === 2 ? 2 : 1, [d[0], d[1], d[2]])
      A.setTool(A.prevTool && A.prevTool !== 'picker' ? A.prevTool : 'pencil')
    }
  }

  // Magnifier: click zooms in (right click out), dragging a frame zooms so
  // the framed area fills the window.
  const ZoomTool = (function () {
    let drag = null
    const box = makeBox('marquee')
    const rect = () => {
      const a = clampPt(drag.a); const b = clampPt(drag.b)
      return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x) + 1, h: Math.abs(b.y - a.y) + 1 }
    }
    return {
      name: 'zoom',
      cursor: () => P.cursors.zoom,
      busy: () => !!drag,
      down (e, pt) { drag = { a: pt, b: pt, cx: e.clientX, cy: e.clientY, btn: e.button, moved: false } },
      move (e, pt) {
        if (!drag) return
        drag.b = pt
        if (Math.abs(e.clientX - drag.cx) > 4 || Math.abs(e.clientY - drag.cy) > 4) drag.moved = true
        if (drag.moved && drag.btn === 0) {
          const r = rect()
          box.show(r, false)
          P.ui.status('Sel', P.T('{w} × {h}пкс', { w: r.w, h: r.h }))
        }
      },
      up (e) {
        const d = drag
        if (!d) return
        const r = d.moved && d.btn === 0 ? rect() : null
        drag = null
        box.hide()
        P.ui.status('Sel', '')
        if (r) V.zoomToRect(r)
        else V.zoomStep(d.btn === 2 ? -1 : 1, d.cx, d.cy)
      },
      cancel () { drag = null; box.hide(); P.ui.status('Sel', '') },
      onZoom () { if (drag && drag.moved) box.show(rect(), false) }
    }
  })()

  // ------------------------------------------------------------ shapes
  const ShapeTool = (function () {
    let st = null
    const box = makeBox('shape-box')

    function norm () {
      const a = st.a; const b = st.b
      st.a = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) }
      st.b = { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) }
    }
    function bbox () {
      return { x: Math.min(st.a.x, st.b.x), y: Math.min(st.a.y, st.b.y), w: Math.abs(st.b.x - st.a.x) + 1, h: Math.abs(st.b.y - st.a.y) + 1 }
    }
    function makeOp (extra) {
      const swap = st.btn === 2
      const isLine = st.k === 'line' || st.k === 'curve'
      const op = {
        t: 'shape', id: st.id, k: st.k, s: A.sizes.shape,
        ol: isLine && A.outline === 'none' ? 'solid' : A.outline,
        fl: isLine ? 'none' : A.fill,
        c1: (swap ? A.color2 : A.color1).slice(), c2: (swap ? A.color1 : A.color2).slice(), seed: st.seed
      }
      if (st.k === 'line') op.pts = [st.a.x, st.a.y, st.b.x, st.b.y]
      else if (st.k === 'curve') op.pts = st.pts.slice()
      else if (st.k === 'polygon') op.pts = st.pts.concat(extra || [])
      else op.b = [st.a.x, st.a.y, st.b.x, st.b.y]
      return op
    }
    const frame = frameRenderer(() => render())
    function render () {
      frame.cancel()
      V.clearPreview()
      if (!st) { box.hide(); return }
      if (st.k === 'polygon' && st.mode !== 'done') {
        // open polyline preview
        const op = makeOp(st.hover ? [st.hover.x, st.hover.y] : [])
        const p = op.pts
        const ctx = V.pctx
        ctx.save()
        ctx.strokeStyle = U.css(op.c1); ctx.lineWidth = op.s; ctx.lineJoin = 'miter'; ctx.lineCap = op.s >= 3 ? 'round' : 'square'
        ctx.beginPath(); ctx.moveTo(p[0] + 0.5, p[1] + 0.5)
        for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i] + 0.5, p[i + 1] + 0.5)
        ctx.stroke(); ctx.restore()
        box.hide()
        P.ui.status('Sel', '')
        return
      }
      const op = makeOp()
      R.drawShape(V.pctx, op)
      S.liveVector(op)
      if (st.k === 'line') {
        if (st.mode === 'edit') box.points([st.a, st.b]); else box.hide()
        P.ui.status('Sel', P.T('{w} × {h}пкс', { w: Math.abs(st.b.x - st.a.x) + 1, h: Math.abs(st.b.y - st.a.y) + 1 }))
      } else if (st.k === 'curve') {
        box.hide()
      } else {
        const b = bbox()
        if (st.mode === 'edit') box.show(b); else box.hide()
        P.ui.status('Sel', P.T('{w} × {h}пкс', { w: b.w, h: b.h }))
      }
    }
    function constrain (e, a, pt) {
      if (!e.shiftKey) return { x: pt.x, y: pt.y }
      const dx = pt.x - a.x; const dy = pt.y - a.y
      if (st.k === 'line' || st.k === 'polygon' || st.k === 'curve') {
        const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
        const len = Math.max(Math.abs(dx), Math.abs(dy))
        if (Math.abs(Math.cos(ang)) > 0.9) return { x: a.x + Math.sign(Math.cos(ang)) * Math.abs(dx), y: a.y }
        if (Math.abs(Math.sin(ang)) > 0.9) return { x: a.x, y: a.y + Math.sign(Math.sin(ang)) * Math.abs(dy) }
        return { x: a.x + Math.sign(dx) * len, y: a.y + Math.sign(dy) * len }
      }
      const d = Math.max(Math.abs(dx), Math.abs(dy))
      return { x: a.x + (dx < 0 ? -d : d), y: a.y + (dy < 0 ? -d : d) }
    }
    function commit () {
      if (!st) return
      if (st.k === 'polygon' && st.mode !== 'done') {
        if (st.pts.length >= 6) { st.mode = 'done' } else { cancel(); return }
      }
      if (st.k === 'curve' && st.mode === 'drag') { cancel(); return }
      const op = makeOp()
      st = null
      S.liveVectorDone()
      box.hide()
      V.clearPreview()
      P.ui.status('Sel', '')
      S.submit(op)
    }
    function cancel () {
      if (!st) return
      const id = st.id
      st = null
      box.hide()
      V.clearPreview()
      P.ui.status('Sel', '')
      S.liveCancel(id)
    }
    function start (e, pt) {
      st = { mode: 'drag', k: A.shape, btn: e.button, a: { x: pt.x, y: pt.y }, b: { x: pt.x, y: pt.y }, id: S.newId(), seed: U.randSeed(), drag: null }
      if (st.k === 'polygon') st.pts = [pt.x, pt.y, pt.x, pt.y]
      render()
    }
    return {
      name: 'shape',
      busy: () => !!(st && st.mode === 'drag'),
      cursor: () => 'crosshair',
      active: () => !!st,
      down (e, pt) {
        if (st && st.mode === 'edit') {
          if (st.k === 'line') {
            const ha = V.imageToClient(st.a.x + 0.5, st.a.y + 0.5); const hb = V.imageToClient(st.b.x + 0.5, st.b.y + 0.5)
            if (Math.hypot(e.clientX - ha.x, e.clientY - ha.y) <= 6) { st.drag = { type: 'end', which: 'a' }; return }
            if (Math.hypot(e.clientX - hb.x, e.clientY - hb.y) <= 6) { st.drag = { type: 'end', which: 'b' }; return }
            const lb = { x: Math.min(st.a.x, st.b.x), y: Math.min(st.a.y, st.b.y), w: Math.abs(st.b.x - st.a.x) + 1, h: Math.abs(st.b.y - st.a.y) + 1 }
            if (inBox(e, lb, 3)) { st.drag = { type: 'move', start: pt, a: st.a, b: st.b }; return }
          } else {
            const b = bbox()
            const hh = hitHandle(e, b)
            if (hh) { st.drag = { type: 'handle', h: hh, start: pt, orig: b }; return }
            if (inBox(e, b, 2)) { st.drag = { type: 'move', start: pt, a: st.a, b: st.b }; return }
          }
          commit()
          if (inCanvas(pt)) start(e, pt)
          return
        }
        if (st && st.mode === 'curve') {
          st.drag = { type: 'ctrl' }
          if (st.stage === 1) { st.pts[2] = st.pts[4] = pt.x; st.pts[3] = st.pts[5] = pt.y } else { st.pts[4] = pt.x; st.pts[5] = pt.y }
          render()
          return
        }
        if (st && st.mode === 'poly') {
          const p = constrain(e, { x: st.pts[st.pts.length - 2], y: st.pts[st.pts.length - 1] }, pt)
          st.pts.push(p.x, p.y)
          st.drag = { type: 'vertex' }
          render()
          return
        }
        if (!inCanvas(pt)) return
        start(e, pt)
      },
      move (e, pt) {
        if (!st) return
        if (st.mode === 'drag') {
          st.b = constrain(e, st.a, pt)
          if (st.k === 'polygon') { st.pts[2] = st.b.x; st.pts[3] = st.b.y }
          frame.soon()
          return
        }
        const d = st.drag
        if (!d) return
        if (d.type === 'end') { st[d.which] = { x: pt.x, y: pt.y }; frame.soon() }
        else if (d.type === 'move') {
          const dx = pt.x - d.start.x; const dy = pt.y - d.start.y
          st.a = { x: d.a.x + dx, y: d.a.y + dy }; st.b = { x: d.b.x + dx, y: d.b.y + dy }
          frame.soon()
        } else if (d.type === 'handle') {
          const nb = applyHandle(d.orig, d.h, pt.x - d.start.x, pt.y - d.start.y)
          st.a = { x: nb.x, y: nb.y }; st.b = { x: nb.x + nb.w - 1, y: nb.y + nb.h - 1 }
          frame.soon()
        } else if (d.type === 'ctrl') {
          if (st.stage === 1) { st.pts[2] = st.pts[4] = pt.x; st.pts[3] = st.pts[5] = pt.y } else { st.pts[4] = pt.x; st.pts[5] = pt.y }
          frame.soon()
        } else if (d.type === 'vertex') {
          const n = st.pts.length
          const p = constrain(e, { x: st.pts[n - 4], y: st.pts[n - 3] }, pt)
          st.pts[n - 2] = p.x; st.pts[n - 1] = p.y
          frame.soon()
        }
      },
      hover (e, pt) {
        if (!st) { setCursor(inCanvas(pt) ? 'crosshair' : 'default'); return }
        if (st.mode === 'poly') {
          st.hover = constrain(e, { x: st.pts[st.pts.length - 2], y: st.pts[st.pts.length - 1] }, pt)
          frame.soon()
          setCursor('crosshair')
          return
        }
        if (st.mode === 'edit' && st.k !== 'line') {
          const b = bbox(); const hh = hitHandle(e, b)
          setCursor(hh ? HCURSOR[hh] : inBox(e, b, 2) ? 'move' : 'crosshair')
          return
        }
        if (st.mode === 'edit' && st.k === 'line') {
          const ha = V.imageToClient(st.a.x + 0.5, st.a.y + 0.5); const hb = V.imageToClient(st.b.x + 0.5, st.b.y + 0.5)
          setCursor(Math.hypot(e.clientX - ha.x, e.clientY - ha.y) <= 6 || Math.hypot(e.clientX - hb.x, e.clientY - hb.y) <= 6 ? 'pointer' : 'crosshair')
          return
        }
        setCursor('crosshair')
      },
      up (e, pt) {
        if (!st) return
        if (st.mode === 'drag') {
          if (st.a.x === st.b.x && st.a.y === st.b.y && st.k !== 'polygon') { cancel(); return }
          if (st.k === 'curve') {
            const a = st.a; const b = st.b
            st.pts = [a.x, a.y, Math.round(a.x + (b.x - a.x) / 3), Math.round(a.y + (b.y - a.y) / 3), Math.round(a.x + (b.x - a.x) * 2 / 3), Math.round(a.y + (b.y - a.y) * 2 / 3), b.x, b.y]
            st.mode = 'curve'; st.stage = 1
          } else if (st.k === 'polygon') {
            st.mode = 'poly'
          } else {
            if (st.k !== 'line') norm()
            st.mode = 'edit'
          }
          render()
          return
        }
        if (st.mode === 'curve' && st.drag) {
          st.drag = null
          if (st.stage === 1) st.stage = 2
          else { commit(); return }
          render()
          return
        }
        if (st.mode === 'poly' && st.drag) {
          st.drag = null
          const n = st.pts.length
          const sx = st.pts[0]; const sy = st.pts[1]
          const lx = st.pts[n - 2]; const ly = st.pts[n - 1]
          if (n >= 8 && Math.hypot(lx - sx, ly - sy) * V.zoom <= 6) {
            st.pts.length = n - 2
            st.mode = 'done'
            commit()
          }
          return
        }
        if (st.drag) {
          if (st.k !== 'line') norm()
          st.drag = null
        }
      },
      dbl () {
        if (st && st.mode === 'poly') {
          // remove duplicate vertex produced by the 2nd click of the double-click
          const n = st.pts.length
          if (n >= 4 && st.pts[n - 2] === st.pts[n - 4] && st.pts[n - 1] === st.pts[n - 3]) st.pts.length = n - 2
          st.mode = 'done'
          commit()
        }
      },
      key (e) {
        if (!st) return false
        if (e.key === 'Escape' || e.key === 'Enter') { commit(); return true }
        if (e.key === 'Delete') { cancel(); return true }
        if (st.mode === 'edit' && e.key.startsWith('Arrow')) {
          const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
          const dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0
          st.a = { x: st.a.x + dx, y: st.a.y + dy }; st.b = { x: st.b.x + dx, y: st.b.y + dy }
          render()
          return true
        }
        return false
      },
      refresh () { if (st) { if (st.k !== A.shape && st.mode === 'edit' && !['line', 'curve', 'polygon'].includes(st.k) && !['line', 'curve', 'polygon'].includes(A.shape)) st.k = A.shape; render() } },
      commit,
      cancel,
      onZoom () { if (st) render() }
    }
  })()

  // ------------------------------------------------------------ selection
  const SelectTool = (function () {
    let sel = null
    let drag = null
    let lasso = null
    const box = makeBox('marquee')
    let procCache = null

    function processed () {
      if (!A.transparentSel) return sel.img
      const key = U.hex(A.color2)
      if (procCache && procCache.img === sel.img && procCache.key === key) return procCache.out
      const c = U.canvas(sel.img.width, sel.img.height)
      const ctx = c.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(sel.img, 0, 0)
      const id = ctx.getImageData(0, 0, c.width, c.height); const d = id.data
      const [r, g, b] = A.color2
      for (let i = 0; i < d.length; i += 4) if (d[i] === r && d[i + 1] === g && d[i + 2] === b) d[i + 3] = 0
      ctx.putImageData(id, 0, 0)
      procCache = { img: sel.img, key, out: c }
      return c
    }
    function curBox () {
      if (!sel) return null
      if (sel.floating) return { x: sel.x, y: sel.y, w: sel.w, h: sel.h }
      return sel.box
    }
    const frame = frameRenderer(() => render())
    const lassoFrame = frameRenderer(() => {
      if (!lasso) return
      const ctx = V.pctx
      V.clearPreview()
      ctx.save(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1 / Math.min(1, V.zoom)
      ctx.beginPath(); ctx.moveTo(lasso[0] + 0.5, lasso[1] + 0.5)
      for (let i = 2; i < lasso.length; i += 2) ctx.lineTo(lasso[i] + 0.5, lasso[i + 1] + 0.5)
      ctx.stroke(); ctx.restore()
    })
    // draws the floating selection's pixels at its current size
    function drawFloating (ctx, x, y) {
      ctx.save()
      R.setResample(ctx, sel.w === sel.img.width && sel.h === sel.img.height ? 'nearest' : A.resample)
      ctx.drawImage(processed(), x, y, sel.w, sel.h)
      ctx.restore()
    }
    function render () {
      frame.cancel()
      V.clearPreview()
      if (!sel) { box.hide(); P.ui.status('Sel', ''); return }
      if (sel.floating) {
        const ctx = V.pctx
        if (sel.cut) R.fillRegion(ctx, sel.region, sel.cc)
        if (drag && drag.trail) ctx.drawImage(drag.trail.cv, 0, 0)
        drawFloating(ctx, sel.x, sel.y)
      }
      const b = curBox()
      box.show(b)
      P.ui.status('Sel', P.T('{w} × {h}пкс', { w: b.w, h: b.h }))
    }
    // Shift-drag: a copy is left at every position the selection passes
    function addTrail () {
      if (!drag.trail) drag.trail = { pts: [], cv: U.canvas(D.width(), D.height()) }
      const t = drag.trail; const n = t.pts.length
      if (n && t.pts[n - 2] === sel.x && t.pts[n - 1] === sel.y) return
      t.pts.push(sel.x, sel.y)
      drawFloating(t.cv.getContext('2d'), sel.x, sel.y)
    }
    function submitTrail (t) {
      if (!t || !t.pts.length) return
      const src = processed()
      const c = U.canvas(src.width, src.height)
      c.getContext('2d').drawImage(src, 0, 0)
      const op = { t: 'stamp', x: t.pts[0], y: t.pts[1], w: sel.w, h: sel.h, trail: t.pts, rs: A.resample, img: c.toDataURL('image/png'), _img: c }
      if (sel.cut) { op.cut = sel.region; op.cc = sel.cc }
      S.submit(op)
      // the hole is filled now; the final drop must not clear it again
      sel.cut = false
      sel.dirty = true
    }
    // corner handles with Shift keep the proportions
    function keepRatio (nb, o, n) {
      if (n.length !== 2) return nb
      const k = Math.max(nb.w / o.w, nb.h / o.h)
      const w = Math.max(1, Math.round(o.w * k)); const h = Math.max(1, Math.round(o.h * k))
      return { x: n.includes('w') ? o.x + o.w - w : o.x, y: n.includes('n') ? o.y + o.h - h : o.y, w, h }
    }
    function lift (copy) {
      if (!sel || sel.floating) return
      const ex = R.extractRegion(D.ctx, sel.region)
      if (!ex) { sel = null; render(); return }
      sel.img = ex.canvas
      sel.x = ex.x; sel.y = ex.y; sel.w = ex.w; sel.h = ex.h
      sel.floating = true
      sel.cut = !copy
      sel.cc = A.color2.slice()
      sel.dirty = true
    }
    function stamp () {
      if (!sel || !sel.floating || !sel.dirty) return
      const src = processed()
      const c = U.canvas(src.width, src.height)
      c.getContext('2d').drawImage(src, 0, 0)
      const op = { t: 'stamp', x: sel.x, y: sel.y, w: sel.w, h: sel.h, rs: A.resample, img: c.toDataURL('image/png'), _img: c }
      if (sel.cut) { op.cut = sel.region; op.cc = sel.cc }
      S.submit(op)
    }
    function commit () {
      if (!sel) return
      if (drag && drag.trail) submitTrail(drag.trail)
      stamp()
      sel = null
      drag = null
      render()
      P.app.updateCommands()
    }
    function cancel () {
      sel = null; drag = null; lasso = null
      render()
      P.app.updateCommands()
    }
    function setSel (s) { sel = s; render(); P.app.updateCommands() }

    const tool = {
      name: 'select',
      busy: () => !!(drag && drag.type === 'new') || !!lasso,
      cursor: () => 'crosshair',
      active: () => !!sel,
      hasFloating: () => !!(sel && sel.floating),
      down (e, pt) {
        if (e.button === 2) {
          if (sel && !inBox(e, curBox(), 2)) commit()
          P.app.selectionMenu(e.clientX, e.clientY)
          return
        }
        if (sel) {
          const b = curBox()
          const hh = hitHandle(e, b)
          if (hh) {
            lift(false)
            drag = { type: 'handle', h: hh, start: pt, orig: { x: sel.x, y: sel.y, w: sel.w, h: sel.h } }
            render()
            return
          }
          if (inBox(e, b, 0)) {
            if (sel.floating && e.ctrlKey) { stamp(); sel.cut = false; sel.dirty = true }
            lift(e.ctrlKey)
            if (!sel) return
            drag = { type: 'move', start: pt, ox: sel.x, oy: sel.y, trail: null }
            if (e.shiftKey) addTrail()
            render()
            return
          }
          commit()
        }
        const a = clampPt(pt)
        if (A.selMode === 'free') {
          lasso = [a.x, a.y]
          return
        }
        drag = { type: 'new', a, b: a }
      },
      move (e, pt) {
        if (lasso) {
          const p = clampPt(pt)
          const n = lasso.length
          if (lasso[n - 2] !== p.x || lasso[n - 1] !== p.y) lasso.push(p.x, p.y)
          lassoFrame.soon()
          return
        }
        if (!drag) return
        if (drag.type === 'new') {
          drag.b = clampPt(pt)
          const a = drag.a; const b = drag.b
          const r = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x) + 1, h: Math.abs(b.y - a.y) + 1 }
          box.show(r, false)
          P.ui.status('Sel', P.T('{w} × {h}пкс', { w: r.w, h: r.h }))
        } else if (drag.type === 'move') {
          sel.x = drag.ox + pt.x - drag.start.x
          sel.y = drag.oy + pt.y - drag.start.y
          if (e.shiftKey) addTrail()
          frame.soon()
        } else if (drag.type === 'handle') {
          const nb = applyHandle(drag.orig, drag.h, pt.x - drag.start.x, pt.y - drag.start.y)
          Object.assign(sel, e.shiftKey ? keepRatio(nb, drag.orig, drag.h) : nb)
          frame.soon()
        }
      },
      hover (e, pt) {
        if (sel) {
          const b = curBox(); const hh = hitHandle(e, b)
          if (hh) return setCursor(HCURSOR[hh])
          if (inBox(e, b, 0)) return setCursor('move')
        }
        setCursor(inCanvas(pt) ? 'crosshair' : 'default')
      },
      up () {
        if (lasso) {
          const pts = lasso; lasso = null
          lassoFrame.cancel()
          V.clearPreview()
          if (pts.length >= 6) {
            const region = { k: 'poly', pts }
            const bx = R.regionBox(region, D.width(), D.height())
            if (bx && (bx.w > 1 || bx.h > 1)) { setSel({ region, box: bx, floating: false }); return }
          }
          setSel(null)
          return
        }
        if (!drag) return
        if (drag.type === 'new') {
          const a = drag.a; const b = drag.b
          drag = null
          if (a.x === b.x && a.y === b.y) { box.hide(); setSel(null); return }
          const r = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x) + 1, h: Math.abs(b.y - a.y) + 1 }
          setSel({ region: { k: 'rect', x: r.x, y: r.y, w: r.w, h: r.h }, box: r, floating: false })
          return
        }
        const t = drag.trail
        drag = null
        if (t) submitTrail(t)
        render()
      },
      key (e) {
        if (!sel) return false
        if (e.key === 'Escape' || e.key === 'Enter') { commit(); return true }
        if (e.key === 'Delete') { tool.deleteSel(); return true }
        if (e.key.startsWith('Arrow')) {
          lift(false)
          const k = e.shiftKey ? 10 : 1
          if (e.key === 'ArrowLeft') sel.x -= k
          if (e.key === 'ArrowRight') sel.x += k
          if (e.key === 'ArrowUp') sel.y -= k
          if (e.key === 'ArrowDown') sel.y += k
          render()
          return true
        }
        return false
      },
      commit,
      cancel,
      onZoom () { render() },
      refresh () { procCache = null; if (sel) render() },
      // ---- commands ----
      selectAll () {
        commit()
        setSel({ region: { k: 'rect', x: 0, y: 0, w: D.width(), h: D.height() }, box: { x: 0, y: 0, w: D.width(), h: D.height() }, floating: false })
      },
      invertSel () {
        if (!sel) { tool.selectAll(); return }
        let region = sel.region
        if (sel.floating) { region = { k: 'rect', x: sel.x, y: sel.y, w: sel.w, h: sel.h }; commit() }
        const inv = { k: 'inv', of: region }
        setSel({ region: inv, box: R.regionBox(inv, D.width(), D.height()), floating: false })
      },
      deleteSel () {
        if (!sel) return
        if (sel.floating) {
          if (sel.cut) S.submit({ t: 'stamp', cut: sel.region, cc: sel.cc })
        } else S.submit({ t: 'stamp', cut: sel.region, cc: A.color2.slice() })
        cancel()
      },
      image () {
        if (!sel) return null
        if (sel.floating) {
          const c = U.canvas(sel.w, sel.h)
          drawFloating(c.getContext('2d'), 0, 0)
          return c
        }
        const ex = R.extractRegion(D.ctx, sel.region)
        return ex ? ex.canvas : null
      },
      cropOp () {
        if (!sel) return null
        let region = sel.region
        if (sel.floating) { region = { k: 'rect', x: sel.x, y: sel.y, w: sel.w, h: sel.h }; stamp() }
        sel = null; render()
        return { t: 'crop', region }
      },
      xform (k) {
        lift(false)
        if (!sel) return
        const src = sel.img
        const rot = k === 'r90' || k === 'l90'
        const c = U.canvas(rot ? src.height : src.width, rot ? src.width : src.height)
        const ctx = c.getContext('2d')
        const w = src.width; const hh = src.height
        if (k === 'r90') ctx.setTransform(0, 1, -1, 0, hh, 0)
        else if (k === 'l90') ctx.setTransform(0, -1, 1, 0, 0, w)
        else if (k === '180') ctx.setTransform(-1, 0, 0, -1, w, hh)
        else if (k === 'fh') ctx.setTransform(-1, 0, 0, 1, w, 0)
        else if (k === 'fv') ctx.setTransform(1, 0, 0, -1, 0, hh)
        ctx.drawImage(src, 0, 0)
        sel.img = c
        if (rot) {
          const cx = sel.x + sel.w / 2; const cy = sel.y + sel.h / 2
          const nw = sel.h; const nh = sel.w
          sel.w = nw; sel.h = nh
          sel.x = Math.round(cx - nw / 2); sel.y = Math.round(cy - nh / 2)
        }
        sel.dirty = true
        render()
      },
      scale (r) {
        lift(false)
        if (!sel) return
        if (r.ax || r.ay) {
          const out = R.skewCanvas(sel.img, r.w, r.h, r.ax, r.ay, null, A.resample)
          sel.img = out; sel.w = out.width; sel.h = out.height
        } else { sel.w = r.w; sel.h = r.h }
        sel.dirty = true
        render()
      },
      size () { const b = curBox(); return b ? { w: b.w, h: b.h } : null },
      invertColors () {
        if (!sel) return false
        if (sel.floating) {
          const c = U.canvas(sel.img.width, sel.img.height); const ctx = c.getContext('2d', { willReadFrequently: true })
          ctx.drawImage(sel.img, 0, 0)
          const id = ctx.getImageData(0, 0, c.width, c.height)
          for (let i = 0; i < id.data.length; i += 4) { id.data[i] = 255 - id.data[i]; id.data[i + 1] = 255 - id.data[i + 1]; id.data[i + 2] = 255 - id.data[i + 2] }
          ctx.putImageData(id, 0, 0)
          sel.img = c; sel.dirty = true
          render()
        } else S.submit({ t: 'invert', region: sel.region })
        return true
      },
      // at: top-left corner in image pixels (default: top-left of the view)
      paste (img, at) {
        commit()
        const o = at || V.visibleOrigin()
        const c = U.canvas(img.width, img.height)
        c.getContext('2d').drawImage(img, 0, 0)
        setSel({ region: { k: 'rect', x: o.x, y: o.y, w: c.width, h: c.height }, box: { x: o.x, y: o.y, w: c.width, h: c.height }, floating: true, img: c, x: o.x, y: o.y, w: c.width, h: c.height, cut: false, dirty: true, pasted: true })
      }
    }
    return tool
  })()

  // ------------------------------------------------------------ text
  const TextTool = (function () {
    let tb = null
    let drag = null
    const ghost = makeBox('marquee')

    const fontPx = () => A.text.size * 96 / 72
    const fontStr = px => (A.text.i ? 'italic ' : '') + (A.text.b ? 'bold ' : '') + px + 'px "' + A.text.font + '"'
    function metrics () {
      const ctx = R.tmp('tm', 1, 1)
      ctx.font = fontStr(fontPx())
      const m = ctx.measureText('ÁgЙy')
      const asc = m.fontBoundingBoxAscent || fontPx() * 0.9; const desc = m.fontBoundingBoxDescent || fontPx() * 0.25
      return { ctx, asc, desc, lh: Math.ceil(asc + desc) }
    }
    function wrap (ctx, text, maxW) {
      const out = []
      const W = s => ctx.measureText(s).width
      for (const para of text.split('\n')) {
        if (para === '') { out.push(''); continue }
        const toks = para.match(/\S+|\s+/g)
        let line = ''
        const pushWord = tok => {
          for (const ch of tok) {
            if (line && W(line + ch) > maxW) { out.push(line); line = ch } else line += ch
          }
        }
        for (const tok of toks) {
          if (/^\s+$/.test(tok)) { line += tok; continue }
          if (W(line + tok) <= maxW) { line += tok; continue }
          if (line.trim() !== '') { out.push(line); line = '' } else line = ''
          if (W(tok) > maxW) pushWord(tok); else line = tok
        }
        out.push(line)
      }
      return out
    }
    function style () {
      if (!tb) return
      const z = V.zoom
      const m = metrics()
      const ta = tb.ta
      ta.style.font = fontStr(fontPx() * z)
      ta.style.lineHeight = (m.lh * z) + 'px'
      ta.style.color = U.css(A.color1)
      ta.style.textDecoration = [A.text.u ? 'underline' : '', A.text.s ? 'line-through' : ''].join(' ').trim() || 'none'
      tb.el.style.background = A.text.opaque ? U.css(A.color2) : 'transparent'
      grow()
      place()
    }
    function grow () {
      const m = metrics()
      const lines = wrap(m.ctx, tb.ta.value, tb.w)
      const need = Math.max(m.lh, lines.length * m.lh)
      if (need > tb.h) tb.h = need
      if (tb.y + tb.h > D.height() && tb.h <= D.height()) tb.y = Math.max(0, D.height() - tb.h)
    }
    function place () {
      const z = V.zoom
      tb.el.style.left = Math.round(tb.x * z) + 'px'; tb.el.style.top = Math.round(tb.y * z) + 'px'
      tb.el.style.width = Math.round(tb.w * z) + 'px'; tb.el.style.height = Math.round(tb.h * z) + 'px'
      HANDLES.forEach((n, i) => {
        const p = handlePos({ x: 0, y: 0, w: tb.w, h: tb.h }, n)
        tb.hs[i].style.left = Math.round(p.x * z) + 'px'; tb.hs[i].style.top = Math.round(p.y * z) + 'px'
      })
      P.ui.status('Sel', P.T('{w} × {h}пкс', { w: tb.w, h: tb.h }))
    }
    function create (r) {
      const el = U.h('div.textbox')
      const ta = U.h('textarea', { spellcheck: 'false', autocomplete: 'off' })
      const grip = U.h('div.tb-grip')
      el.appendChild(grip)
      el.appendChild(ta)
      const hs = HANDLES.map(n => { const d = U.h('div.sel-handle', { style: { position: 'absolute', cursor: HCURSOR[n] }, dataset: { h: n } }); el.appendChild(d); return d })
      V.ui.appendChild(el)
      tb = { x: r.x, y: r.y, w: r.w, h: r.h, el, ta, hs }
      ta.addEventListener('input', () => { grow(); place() })
      ta.addEventListener('keydown', e => {
        if (e.key === 'Escape') { e.preventDefault(); commit(); }
        e.stopPropagation()
        if (e.ctrlKey && !e.altKey) {
          const k = e.key.toLowerCase()
          if (k === 'b' || k === 'и') { e.preventDefault(); A.toggleText('b') }
          if (k === 'i' || k === 'ш') { e.preventDefault(); A.toggleText('i') }
          if (k === 'u' || k === 'г') { e.preventDefault(); A.toggleText('u') }
        }
      })
      style()
      P.ui.showTextTab(true)
      setTimeout(() => ta.focus(), 0)
    }
    function rasterize () {
      const m = metrics()
      const c = U.canvas(tb.w, tb.h)
      const ctx = c.getContext('2d')
      if (A.text.opaque) { ctx.fillStyle = U.css(A.color2); ctx.fillRect(0, 0, tb.w, tb.h) }
      ctx.font = fontStr(fontPx())
      ctx.fillStyle = ctx.strokeStyle = U.css(A.color1)
      ctx.textBaseline = 'alphabetic'
      const lines = wrap(ctx, tb.ta.value, tb.w)
      const lw = Math.max(1, Math.round(fontPx() / 15))
      lines.forEach((ln, i) => {
        const y = i * m.lh + (m.lh - (m.asc + m.desc)) / 2 + m.asc
        ctx.fillText(ln, 0, y)
        const w = ctx.measureText(ln.replace(/\s+$/, '')).width
        if (A.text.u && w) ctx.fillRect(0, Math.round(y + m.desc * 0.35), w, lw)
        if (A.text.s && w) ctx.fillRect(0, Math.round(y - m.asc * 0.3), w, lw)
      })
      return c
    }
    function commit () {
      if (!tb) return
      const text = tb.ta.value
      if (text.replace(/\s/g, '') !== '' || A.text.opaque) {
        const c = rasterize()
        S.submit({ t: 'stamp', x: tb.x, y: tb.y, w: c.width, h: c.height, img: c.toDataURL('image/png'), _img: c })
      }
      tb.el.remove()
      tb = null
      P.ui.showTextTab(false)
      P.ui.status('Sel', '')
    }
    function cancel () {
      if (!tb) return
      tb.el.remove(); tb = null
      P.ui.showTextTab(false)
    }
    return {
      name: 'text',
      busy: () => !!drag,
      cursor: () => 'text',
      active: () => !!tb,
      down (e, pt) {
        if (tb) {
          const t = e.target
          if (t.classList && t.classList.contains('sel-handle') && tb.el.contains(t)) {
            drag = { type: 'handle', h: t.dataset.h, start: pt, orig: { x: tb.x, y: tb.y, w: tb.w, h: tb.h } }
            return
          }
          if (t.classList && t.classList.contains('tb-grip')) {
            drag = { type: 'move', start: pt, ox: tb.x, oy: tb.y }
            return
          }
          commit()
          return
        }
        if (!inCanvas(pt)) return
        drag = { type: 'new', a: pt, b: pt }
      },
      move (e, pt) {
        if (!drag) return
        if (drag.type === 'new') {
          drag.b = clampPt(pt)
          const a = drag.a; const b = drag.b
          ghost.show({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x) + 1, h: Math.abs(b.y - a.y) + 1 }, false)
        } else if (drag.type === 'move') {
          tb.x = drag.ox + pt.x - drag.start.x; tb.y = drag.oy + pt.y - drag.start.y; place()
        } else if (drag.type === 'handle') {
          const nb = applyHandle(drag.orig, drag.h, pt.x - drag.start.x, pt.y - drag.start.y)
          Object.assign(tb, nb); tb.w = Math.max(8, tb.w); grow(); place()
        }
      },
      hover (e, pt) { setCursor(inCanvas(pt) ? 'text' : 'default') },
      up () {
        if (!drag) return
        const d = drag; drag = null
        if (d.type === 'new') {
          ghost.hide()
          const a = d.a; const b = d.b
          let r = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x) + 1, h: Math.abs(b.y - a.y) + 1 }
          if (r.w < 8 || r.h < 8) {
            const m = metrics()
            r = { x: a.x, y: a.y, w: Math.max(40, Math.min(220, D.width() - a.x)), h: m.lh }
          }
          create(r)
        } else if (tb) setTimeout(() => tb && tb.ta.focus(), 0)
      },
      key (e) { return false },
      commit,
      cancel,
      refresh () { style() },
      onZoom () { if (tb) style() },
      focus () { if (tb) tb.ta.focus() },
      textarea: () => tb && tb.ta
    }
  })()

  // ------------------------------------------------------------ registry & dispatch
  T.TOOLS = {
    pencil: StrokeTool('pencil'),
    brush: StrokeTool('brush'),
    eraser: StrokeTool('eraser'),
    fill: FillTool,
    picker: PickerTool,
    zoom: ZoomTool,
    shape: ShapeTool,
    select: SelectTool,
    text: TextTool
  }
  T.cur = () => T.TOOLS[A.tool]
  T.select = SelectTool
  T.shape = ShapeTool
  T.text = TextTool

  T.commitAll = function () {
    for (const k in T.TOOLS) { const t = T.TOOLS[k]; if (t.commit) t.commit() }
  }
  T.cancelTransient = function () {
    // Undo of something not yet committed (floating selection, shape, text)
    if (SelectTool.active()) { SelectTool.cancel(); return true }
    if (ShapeTool.active()) { ShapeTool.cancel(); return true }
    if (TextTool.active()) { TextTool.cancel(); return true }
    return false
  }

  let pointer = null
  let eraserEl = null
  let lastClient = null

  T.init = function () {
    A = P.app
    const ws = V.ws
    eraserEl = U.h('div.eraser-cursor', { style: { display: 'none' } })
    V.ui.appendChild(eraserEl)
    ws.addEventListener('pointerdown', onDown)
    ws.addEventListener('pointermove', onMove)
    ws.addEventListener('pointerup', onUp)
    ws.addEventListener('pointercancel', onUp)
    ws.addEventListener('dblclick', e => { const t = T.cur(); if (t.dbl) t.dbl(e) })
    ws.addEventListener('contextmenu', e => e.preventDefault())
    ws.addEventListener('pointerleave', () => {
      if (!pointer) { P.ui.status('Pos', ''); eraserEl.style.display = 'none'; S.cursor(-1, -1, A.tool) }
    })
    ws.addEventListener('wheel', e => {
      if (e.ctrlKey) { e.preventDefault(); V.zoomStep(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY) }
    }, { passive: false })
    V.on('zoom', () => { for (const k in T.TOOLS) if (T.TOOLS[k].onZoom) T.TOOLS[k].onZoom(); updateEraser() })
    V.on('scroll', () => { if (lastClient) updateStatusPos(lastClient) })
  }

  function overScrollbar (e) {
    const r = V.ws.getBoundingClientRect()
    return e.clientX - r.left >= V.ws.clientWidth || e.clientY - r.top >= V.ws.clientHeight
  }

  function onDown (e) {
    if (P.dialogs.isOpen()) return
    if (e.target.tagName === 'TEXTAREA') return
    if (e.target.classList.contains('cv-handle')) return
    if (overScrollbar(e)) return
    if (e.button !== 0 && e.button !== 2) return
    const tool = T.cur()
    const pt = V.clientToImage(e.clientX, e.clientY)
    if (pointer) {
      // second button while drawing cancels the current stroke (like Paint)
      if (e.button !== pointer.button && tool.cancel && tool.busy && tool.busy()) { tool.cancel(); pointer = null }
      return
    }
    e.preventDefault()
    if (document.activeElement && document.activeElement !== document.body && document.activeElement.tagName !== 'TEXTAREA') document.activeElement.blur()
    pointer = { button: e.button, id: e.pointerId }
    try { V.ws.setPointerCapture(e.pointerId) } catch (err) {}
    tool.down(e, pt)
  }

  function onMove (e) {
    lastClient = { x: e.clientX, y: e.clientY }
    const pt = V.clientToImage(e.clientX, e.clientY)
    updateStatusPos(lastClient)
    S.cursor(inCanvas(pt) ? pt.x : -1, inCanvas(pt) ? pt.y : -1, A.tool)
    const tool = T.cur()
    if (pointer && pointer.id === e.pointerId) {
      if (tool.move) {
        const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]
        for (const ce of (evs.length ? evs : [e])) tool.move(ce, V.clientToImage(ce.clientX, ce.clientY))
      }
    } else if (!pointer) {
      if (tool.hover) tool.hover(e, pt)
      else setCursor(inCanvas(pt) && !overScrollbar(e) ? tool.cursor() : 'default')
    }
    updateEraser(pt)
  }

  function onUp (e) {
    if (!pointer || pointer.id !== e.pointerId) return
    const tool = T.cur()
    const pt = V.clientToImage(e.clientX, e.clientY)
    pointer = null
    try { V.ws.releasePointerCapture(e.pointerId) } catch (err) {}
    if (tool.up) tool.up(e, pt)
    P.app.updateCommands()
  }

  function updateStatusPos (c) {
    const pt = V.clientToImage(c.x, c.y)
    P.ui.status('Pos', inCanvas(pt) ? P.T('{x}, {y}пкс', { x: pt.x, y: pt.y }) : '')
  }

  function updateEraser (pt) {
    if (A.tool !== 'eraser') { eraserEl.style.display = 'none'; return }
    if (!pt) { if (!lastClient) return; pt = V.clientToImage(lastClient.x, lastClient.y) }
    if (!inCanvas(pt) && !pointer) { eraserEl.style.display = 'none'; return }
    const s = A.sizes.eraser; const o = Math.floor(s / 2); const z = V.zoom
    eraserEl.style.display = ''
    eraserEl.style.left = Math.round((pt.x - o) * z) + 'px'
    eraserEl.style.top = Math.round((pt.y - o) * z) + 'px'
    eraserEl.style.width = Math.max(3, Math.round(s * z)) + 'px'
    eraserEl.style.height = Math.max(3, Math.round(s * z)) + 'px'
    eraserEl.classList.toggle('color', !!(pointer && pointer.button === 2))
  }

  T.setCursorFor = function () {
    const tool = T.cur()
    setCursor(tool.cursor())
    updateEraser()
  }
  T.refresh = function () {
    for (const k in T.TOOLS) if (T.TOOLS[k].refresh) T.TOOLS[k].refresh()
    updateEraser()
  }
})(window.P)
