'use strict';
// Deterministic raster primitives. Every op is rendered by these functions on
// every peer, so they must depend only on the op data and the canvas pixels.
(function (P) {
  const U = P.util
  const R = P.raster = {}

  const pool = {}
  function tmp (key, w, h) {
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h))
    let c = pool[key]
    if (!c) c = pool[key] = U.canvas(w, h)
    if (c.width < w || c.height < h) { c.width = Math.max(c.width, w); c.height = Math.max(c.height, h) }
    const ctx = c.getContext('2d', { willReadFrequently: true })
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.filter = 'none'
    ctx.imageSmoothingEnabled = true
    ctx.clearRect(0, 0, w, h)
    return ctx
  }
  R.tmp = tmp

  R.SIZES = {
    pencil: [1, 2, 3, 4],
    brush: [1, 3, 5, 8],
    eraser: [4, 6, 8, 10],
    shape: [1, 3, 5, 8]
  }

  R.BRUSHES = ['brush', 'calli1', 'calli2', 'air', 'oil', 'crayon', 'marker', 'npencil', 'water']
  R.BRUSH_NAMES = {
    brush: 'Кисть',
    calli1: 'Каллиграфическая кисть 1',
    calli2: 'Каллиграфическая кисть 2',
    air: 'Распылитель',
    oil: 'Масляная кисть',
    crayon: 'Пастель',
    marker: 'Маркер',
    npencil: 'Обычный карандаш',
    water: 'Акварель'
  }
  R.STYLES = ['none', 'solid', 'crayon', 'marker', 'oil', 'npencil', 'water']
  R.STYLE_NAMES = {
    solid: 'Сплошной цвет', crayon: 'Пастель', marker: 'Маркер', oil: 'Масло', npencil: 'Обычный карандаш', water: 'Акварель'
  }

  R.brushWidth = function (b, s) {
    switch (b) {
      case 'brush': return Math.max(1, s)
      case 'calli1': case 'calli2': return s * 2 + 5
      case 'air': return s * 2 + 6
      case 'oil': return s * 2 + 6
      case 'crayon': return s * 2 + 6
      case 'marker': return s * 2 + 6
      case 'npencil': return s + 1
      case 'water': return s * 2 + 8
    }
    return s
  }
  const BW = R.brushWidth

  function line (x0, y0, x1, y1, fn) {
    const dx = Math.abs(x1 - x0); const sx = x0 < x1 ? 1 : -1
    const dy = -Math.abs(y1 - y0); const sy = y0 < y1 ? 1 : -1
    let err = dx + dy
    for (let guard = 0; guard < 100000; guard++) {
      fn(x0, y0)
      if (x0 === x1 && y0 === y1) break
      const e2 = 2 * err
      if (e2 >= dy) { err += dy; x0 += sx }
      if (e2 <= dx) { err += dx; y0 += sy }
    }
  }
  R.line = line

  function segPts (op, i) {
    const p = op.p
    const bx = p[2 * i] + 0.5; const by = p[2 * i + 1] + 0.5
    if (!i) return [bx, by, bx, by]
    return [p[2 * i - 2] + 0.5, p[2 * i - 1] + 0.5, bx, by]
  }

  function bboxPts (p, m, cv) {
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity
    for (let i = 0; i < p.length; i += 2) {
      if (p[i] < x0) x0 = p[i]; if (p[i] > x1) x1 = p[i]
      if (p[i + 1] < y0) y0 = p[i + 1]; if (p[i + 1] > y1) y1 = p[i + 1]
    }
    x0 = Math.max(0, Math.floor(x0 - m)); y0 = Math.max(0, Math.floor(y0 - m))
    x1 = Math.min(cv.width, Math.ceil(x1 + m + 1)); y1 = Math.min(cv.height, Math.ceil(y1 + m + 1))
    if (x1 <= x0 || y1 <= y0) return null
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
  }

  function polyline (ctx, p, ox, oy) {
    ctx.beginPath()
    ctx.moveTo(p[0] + ox, p[1] + oy)
    if (p.length === 2) ctx.lineTo(p[0] + ox + 0.01, p[1] + oy)
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i] + ox, p[i + 1] + oy)
  }

  // ---------- brushes ----------
  const BRUSH = {}

  BRUSH.brush = {
    seg (dst, op, i) {
      const [ax, ay, bx, by] = segPts(op, i)
      const w = BW('brush', op.s)
      dst.fillStyle = dst.strokeStyle = U.css(op.c)
      if (ax === bx && ay === by) {
        dst.beginPath(); dst.arc(bx, by, w / 2, 0, Math.PI * 2); dst.fill(); return
      }
      dst.lineWidth = w; dst.lineCap = 'round'; dst.lineJoin = 'round'
      dst.beginPath(); dst.moveTo(ax, ay); dst.lineTo(bx, by); dst.stroke()
    }
  }

  function calli (dir) {
    return {
      seg (dst, op, i) {
        const [ax, ay, bx, by] = segPts(op, i)
        const d = BW('calli1', op.s) / 2 / Math.SQRT2
        const nx = d; const ny = dir === 1 ? -d : d
        dst.fillStyle = dst.strokeStyle = U.css(op.c)
        dst.beginPath()
        dst.moveTo(ax - nx, ay - ny); dst.lineTo(ax + nx, ay + ny)
        dst.lineTo(bx + nx, by + ny); dst.lineTo(bx - nx, by - ny)
        dst.closePath(); dst.fill()
        dst.lineWidth = 1.5; dst.lineCap = 'round'
        dst.beginPath(); dst.moveTo(bx - nx, by - ny); dst.lineTo(bx + nx, by + ny); dst.stroke()
      }
    }
  }
  BRUSH.calli1 = calli(1)
  BRUSH.calli2 = calli(2)

  BRUSH.air = {
    seg (dst, op, i) {
      const r = BW('air', op.s)
      const x = op.p[2 * i]; const y = op.p[2 * i + 1]
      const rnd = U.rng((op.seed ^ Math.imul(i + 1, 0x9E3779B1)) >>> 0)
      const n = Math.round(r * r * 0.12) + 3
      dst.fillStyle = U.css(op.c)
      for (let k = 0; k < n; k++) {
        const a = rnd() * Math.PI * 2; const rr = r * Math.sqrt(rnd())
        dst.fillRect(Math.round(x + Math.cos(a) * rr), Math.round(y + Math.sin(a) * rr), 1, 1)
      }
    }
  }

  BRUSH.oil = {
    seg (dst, op, i) {
      if (!i) return
      const [ax, ay, bx, by] = segPts(op, i)
      const dx = bx - ax; const dy = by - ay; const len = Math.hypot(dx, dy)
      if (!len) return
      const w = BW('oil', op.s); const px = -dy / len; const py = dx / len
      const nb = Math.max(4, Math.round(w / 1.5))
      const rnd = U.rng(op.seed)
      dst.lineCap = 'round'
      dst.lineWidth = Math.max(1, (w / nb) * 1.6)
      for (let k = 0; k < nb; k++) {
        const t = (k / (nb - 1) - 0.5) * w
        const f = 0.7 + rnd() * 0.55; const a = 0.55 + rnd() * 0.45
        const c = op.c.map(v => U.clamp(Math.round(v * f + (f > 1 ? (f - 1) * 140 : 0)), 0, 255))
        dst.globalAlpha = a
        dst.strokeStyle = U.css(c)
        dst.beginPath(); dst.moveTo(ax + px * t, ay + py * t); dst.lineTo(bx + px * t, by + py * t); dst.stroke()
      }
      dst.globalAlpha = 1
    }
  }

  function grain (density, alpha, key) {
    return {
      seg (dst, op, i) {
        const [ax, ay, bx, by] = segPts(op, i)
        const w = BW(key, op.s); const r = w / 2 + 1
        const x0 = Math.floor(Math.min(ax, bx) - r); const y0 = Math.floor(Math.min(ay, by) - r)
        const x1 = Math.ceil(Math.max(ax, bx) + r); const y1 = Math.ceil(Math.max(ay, by) + r)
        const bw = x1 - x0; const bh = y1 - y0
        const t = tmp('grain', bw, bh)
        t.fillStyle = t.strokeStyle = '#000'
        if (ax === bx && ay === by) {
          t.beginPath(); t.arc(ax - x0, ay - y0, w / 2, 0, Math.PI * 2); t.fill()
        } else {
          t.lineWidth = w; t.lineCap = 'round'
          t.beginPath(); t.moveTo(ax - x0, ay - y0); t.lineTo(bx - x0, by - y0); t.stroke()
        }
        const img = t.getImageData(0, 0, bw, bh); const d = img.data
        const cr = op.c[0]; const cg = op.c[1]; const cb = op.c[2]; const A = Math.round(alpha * 255)
        for (let y = 0; y < bh; y++) {
          for (let x = 0; x < bw; x++) {
            const k = (y * bw + x) * 4
            if (d[k + 3] > 100 && U.hash3(x + x0, y + y0, op.seed) < density) {
              d[k] = cr; d[k + 1] = cg; d[k + 2] = cb; d[k + 3] = A
            } else d[k + 3] = 0
          }
        }
        t.putImageData(img, 0, 0)
        dst.drawImage(t.canvas, 0, 0, bw, bh, x0, y0, bw, bh)
      }
    }
  }
  BRUSH.crayon = grain(0.55, 1, 'crayon')
  BRUSH.npencil = grain(0.5, 0.55, 'npencil')

  BRUSH.marker = {
    full (dst, op) {
      const w = BW('marker', op.s)
      const bb = bboxPts(op.p, w / 2 + 2, dst.canvas)
      if (!bb) return
      const t = tmp('full', bb.w, bb.h)
      t.strokeStyle = U.css(op.c); t.lineWidth = w; t.lineCap = 'square'; t.lineJoin = 'round'
      polyline(t, op.p, -bb.x + 0.5, -bb.y + 0.5); t.stroke()
      dst.save(); dst.globalAlpha = 0.5
      dst.drawImage(t.canvas, 0, 0, bb.w, bb.h, bb.x, bb.y, bb.w, bb.h)
      dst.restore()
    }
  }

  BRUSH.water = {
    full (dst, op) {
      const w = BW('water', op.s)
      const bb = bboxPts(op.p, w / 2 + 8, dst.canvas)
      if (!bb) return
      const t = tmp('full', bb.w, bb.h)
      t.strokeStyle = U.css(op.c); t.lineWidth = w; t.lineCap = 'round'; t.lineJoin = 'round'
      polyline(t, op.p, -bb.x + 0.5, -bb.y + 0.5); t.stroke()
      dst.save(); dst.globalAlpha = 0.38; dst.filter = 'blur(2px)'
      dst.drawImage(t.canvas, 0, 0, bb.w, bb.h, bb.x, bb.y, bb.w, bb.h)
      dst.restore()
    }
  }

  R.isFull = op => op.t === 'stroke' && op.tool === 'brush' && !!(BRUSH[op.brush] && BRUSH[op.brush].full)

  function colorErase (dst, src, op, from) {
    const p = op.p; const n = p.length >> 1; const s = op.s; const o = Math.floor(s / 2)
    const W = src.canvas.width; const H = src.canvas.height
    const fromC = U.packRGBA(op.c1); const toC = U.packRGBA(op.c)
    const same = dst === src
    for (let i = from; i < n; i++) {
      const bx = p[2 * i]; const by = p[2 * i + 1]
      const ax = i ? p[2 * i - 2] : bx; const ay = i ? p[2 * i - 1] : by
      const x0 = Math.max(0, Math.min(ax, bx) - o); const y0 = Math.max(0, Math.min(ay, by) - o)
      const x1 = Math.min(W, Math.max(ax, bx) - o + s); const y1 = Math.min(H, Math.max(ay, by) - o + s)
      if (x1 <= x0 || y1 <= y0) continue
      const w = x1 - x0; const h = y1 - y0
      const img = src.getImageData(x0, y0, w, h); const d = new Uint32Array(img.data.buffer)
      const out = same ? d : new Uint32Array(w * h)
      let any = false
      line(ax, ay, bx, by, (x, y) => {
        const ya = Math.max(y - o, y0); const yb = Math.min(y - o + s, y1)
        const xa = Math.max(x - o, x0); const xb = Math.min(x - o + s, x1)
        for (let yy = ya; yy < yb; yy++) {
          for (let xx = xa; xx < xb; xx++) {
            const k = (yy - y0) * w + (xx - x0)
            if (d[k] === fromC) { out[k] = toC; any = true }
          }
        }
      })
      if (!any) continue
      if (same) dst.putImageData(img, x0, y0)
      else {
        const t = tmp('ce', w, h)
        const oi = t.createImageData(w, h)
        new Uint32Array(oi.data.buffer).set(out)
        t.putImageData(oi, 0, 0)
        dst.drawImage(t.canvas, 0, 0, w, h, x0, y0, w, h)
      }
    }
  }

  // Draws points [from..] of a stroke op. Segment i joins point i-1 and i.
  R.drawStroke = function (dst, op, from, src) {
    const p = op.p; const n = p.length >> 1
    from = from || 0
    if (op.tool === 'pencil' || op.tool === 'eraser') {
      dst.fillStyle = U.css(op.c)
      const s = op.s; const o = Math.floor(s / 2)
      for (let i = from; i < n; i++) {
        const bx = p[2 * i]; const by = p[2 * i + 1]
        const ax = i ? p[2 * i - 2] : bx; const ay = i ? p[2 * i - 1] : by
        line(ax, ay, bx, by, (x, y) => dst.fillRect(x - o, y - o, s, s))
      }
      return
    }
    if (op.tool === 'ceraser') { colorErase(dst, src || dst, op, from); return }
    const B = BRUSH[op.brush] || BRUSH.brush
    if (B.full) { B.full(dst, op); return }
    for (let i = from; i < n; i++) B.seg(dst, op, i)
  }

  // ---------- flood fill ----------
  R.floodFill = function (dst, src, x, y, c) {
    const W = src.canvas.width; const H = src.canvas.height
    if (x < 0 || y < 0 || x >= W || y >= H) return
    const img = src.getImageData(0, 0, W, H)
    const d = new Uint32Array(img.data.buffer)
    const target = d[y * W + x]; const repl = U.packRGBA(c)
    if (target === repl) return
    const same = dst === src
    let minX = x; let maxX = x; let minY = y; let maxY = y
    const mark = same ? null : new Uint8Array(W * H)
    const stack = [x, y]
    while (stack.length) {
      const yy = stack.pop(); const xx = stack.pop()
      const row = yy * W
      if (d[row + xx] !== target) continue
      let lx = xx; while (lx > 0 && d[row + lx - 1] === target) lx--
      let rx = xx; while (rx < W - 1 && d[row + rx + 1] === target) rx++
      if (lx < minX) minX = lx; if (rx > maxX) maxX = rx
      if (yy < minY) minY = yy; if (yy > maxY) maxY = yy
      let up = false; let down = false
      for (let i = lx; i <= rx; i++) {
        d[row + i] = repl
        if (mark) mark[row + i] = 1
        if (yy > 0) {
          if (d[row - W + i] === target) { if (!up) { stack.push(i, yy - 1); up = true } } else up = false
        }
        if (yy < H - 1) {
          if (d[row + W + i] === target) { if (!down) { stack.push(i, yy + 1); down = true } } else down = false
        }
      }
    }
    if (same) { dst.putImageData(img, 0, 0, minX, minY, maxX - minX + 1, maxY - minY + 1); return }
    const w = maxX - minX + 1; const h = maxY - minY + 1
    const t = tmp('ff', w, h)
    const oi = t.createImageData(w, h); const o32 = new Uint32Array(oi.data.buffer)
    for (let yy = 0; yy < h; yy++) {
      const r0 = (yy + minY) * W + minX
      for (let xx = 0; xx < w; xx++) if (mark[r0 + xx]) o32[yy * w + xx] = repl
    }
    t.putImageData(oi, 0, 0)
    dst.drawImage(t.canvas, 0, 0, w, h, minX, minY, w, h)
  }

  // ---------- shapes ----------
  R.SHAPES = ['line', 'curve', 'ellipse', 'rect', 'roundrect', 'polygon', 'triangle', 'rtriangle', 'diamond',
    'pentagon', 'hexagon', 'arrowR', 'arrowL', 'arrowU', 'arrowD', 'star4', 'star5', 'star6',
    'calloutRect', 'calloutOval', 'calloutCloud', 'heart', 'lightning']
  R.SHAPE_NAMES = {
    line: 'Линия', curve: 'Кривая', ellipse: 'Овал', rect: 'Прямоугольник', roundrect: 'Скругленный прямоугольник',
    polygon: 'Многоугольник', triangle: 'Треугольник', rtriangle: 'Прямоугольный треугольник', diamond: 'Ромб',
    pentagon: 'Пятиугольник', hexagon: 'Шестиугольник', arrowR: 'Стрелка вправо', arrowL: 'Стрелка влево',
    arrowU: 'Стрелка вверх', arrowD: 'Стрелка вниз', star4: 'Четырехконечная звезда', star5: 'Пятиконечная звезда',
    star6: 'Шестиконечная звезда', calloutRect: 'Скругленная прямоугольная выноска', calloutOval: 'Овальная выноска',
    calloutCloud: 'Выноска-облако', heart: 'Сердце', lightning: 'Молния'
  }
  const SHARP = new Set(['rect', 'triangle', 'rtriangle', 'diamond', 'pentagon', 'hexagon', 'arrowR', 'arrowL', 'arrowU',
    'arrowD', 'star4', 'star5', 'star6', 'lightning', 'polygon'])

  function normalize (pts) {
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity
    for (let i = 0; i < pts.length; i += 2) {
      x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1])
    }
    const out = []
    for (let i = 0; i < pts.length; i += 2) out.push((pts[i] - x0) / (x1 - x0 || 1), (pts[i + 1] - y0) / (y1 - y0 || 1))
    return out
  }
  function regular (n, start) {
    const out = []
    for (let k = 0; k < n; k++) { const a = start + (k * 2 * Math.PI) / n; out.push(Math.cos(a), Math.sin(a)) }
    return normalize(out)
  }
  function star (n, inner) {
    const out = []
    for (let k = 0; k < n * 2; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / n; const r = k % 2 ? inner : 1
      out.push(Math.cos(a) * r, Math.sin(a) * r)
    }
    return normalize(out)
  }
  function ellipsePts (cx, cy, rx, ry, n, a0, a1) {
    const out = []
    if (a0 === undefined) { a0 = 0; a1 = Math.PI * 2 }
    const closedFull = a1 - a0 >= Math.PI * 2 - 1e-9
    const steps = Math.max(8, n)
    for (let k = 0; k < (closedFull ? steps : steps + 1); k++) {
      const a = a0 + ((a1 - a0) * k) / steps
      out.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry)
    }
    return out
  }
  function arcN (w, h) { return U.clamp(Math.round((Math.abs(w) + Math.abs(h)) / 3), 24, 360) }

  function roundRectUnit (x0, y0, x1, y1, rx, ry, corner) {
    const out = []
    const arc = (cx, cy, a0) => {
      for (let k = 0; k <= corner; k++) {
        const a = a0 + (k / corner) * (Math.PI / 2)
        out.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry)
      }
    }
    arc(x0 + rx, y0 + ry, Math.PI)
    arc(x1 - rx, y0 + ry, Math.PI * 1.5)
    arc(x1 - rx, y1 - ry, 0)
    arc(x0 + rx, y1 - ry, Math.PI / 2)
    return out
  }

  const HEART = (function () {
    const out = []
    for (let k = 0; k < 160; k++) {
      const t = (k / 160) * Math.PI * 2
      const x = 16 * Math.pow(Math.sin(t), 3)
      const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))
      out.push(x, y)
    }
    return normalize(out)
  })()

  const LIGHTNING = [0.392, 0, 0, 0.182, 0.350, 0.390, 0.231, 0.450, 0.565, 0.644, 0.462, 0.691, 1, 1,
    0.684, 0.598, 0.767, 0.556, 0.520, 0.287, 0.605, 0.240]

  const CLOUD = (function () {
    const bumps = []
    const nb = 9
    for (let k = 0; k < nb; k++) {
      const a = -Math.PI / 2 + (k * 2 * Math.PI) / nb + 0.2
      bumps.push([0.5 + Math.cos(a) * 0.34, 0.5 + Math.sin(a) * 0.3, k % 2 ? 0.17 : 0.2])
    }
    const out = []
    const N = 200
    for (let k = 0; k < N; k++) {
      const th = (k / N) * Math.PI * 2; const dx = Math.cos(th); const dy = Math.sin(th)
      let best = 0
      for (const [bx, by, r] of bumps) {
        const ox = 0.5 - bx; const oy = 0.5 - by
        const b = dx * ox + dy * oy; const c = ox * ox + oy * oy - r * r
        const disc = b * b - c
        if (disc >= 0) best = Math.max(best, -b + Math.sqrt(disc))
      }
      out.push(0.5 + dx * best, 0.5 + dy * best)
    }
    const body = normalize(out).map((v, i) => (i % 2 ? v * 0.8 : v))
    return [body, ellipsePts(0.2, 0.88, 0.06, 0.055, 24), ellipsePts(0.09, 0.965, 0.04, 0.035, 20)]
  })()

  const UNIT = {
    rect: () => [[0, 0, 1, 0, 1, 1, 0, 1]],
    ellipse: (w, h) => [ellipsePts(0.5, 0.5, 0.5, 0.5, arcN(w, h))],
    roundrect: (w, h) => {
      const r = Math.min(Math.abs(w), Math.abs(h)) / 5
      return [roundRectUnit(0, 0, 1, 1, r / (w || 1), r / (h || 1), 10)]
    },
    triangle: () => [[0.5, 0, 1, 1, 0, 1]],
    rtriangle: () => [[0, 0, 1, 1, 0, 1]],
    diamond: () => [[0.5, 0, 1, 0.5, 0.5, 1, 0, 0.5]],
    pentagon: () => [regular(5, -Math.PI / 2)],
    hexagon: () => [regular(6, 0)],
    arrowR: () => [[0, 0.25, 0.5, 0.25, 0.5, 0, 1, 0.5, 0.5, 1, 0.5, 0.75, 0, 0.75]],
    arrowL: () => [[1, 0.25, 0.5, 0.25, 0.5, 0, 0, 0.5, 0.5, 1, 0.5, 0.75, 1, 0.75]],
    arrowU: () => [[0.25, 1, 0.25, 0.5, 0, 0.5, 0.5, 0, 1, 0.5, 0.75, 0.5, 0.75, 1]],
    arrowD: () => [[0.25, 0, 0.25, 0.5, 0, 0.5, 0.5, 1, 1, 0.5, 0.75, 0.5, 0.75, 0]],
    star4: () => [star(4, 0.38)],
    star5: () => [star(5, 0.382)],
    star6: () => [star(6, 0.577)],
    calloutRect: (w, h) => {
      const bodyH = 0.78
      const r = Math.min(Math.abs(w), Math.abs(h) * bodyH) / 6
      const rx = r / (w || 1); const ry = r / (h || 1)
      const pts = roundRectUnit(0, 0, 1, bodyH, rx, ry, 8)
      // insert tail between bottom-right and bottom-left arcs (index after 3rd arc)
      const cut = 9 * 2 * 3
      const tail = [0.36, bodyH, 0.12, 1, 0.2, bodyH]
      return [pts.slice(0, cut).concat(tail, pts.slice(cut))]
    },
    calloutOval: (w, h) => {
      const a0 = (125 * Math.PI) / 180; const a1 = (105 * Math.PI) / 180 + Math.PI * 2
      const pts = ellipsePts(0.5, 0.4, 0.5, 0.4, arcN(w, h), a0, a1)
      pts.push(0.12, 1)
      return [pts]
    },
    calloutCloud: () => CLOUD,
    heart: () => [HEART],
    lightning: () => [LIGHTNING]
  }

  function bezier (p, n) {
    const out = []
    for (let k = 0; k <= n; k++) {
      const t = k / n; const u = 1 - t
      const a = u * u * u; const b = 3 * u * u * t; const c = 3 * u * t * t; const d = t * t * t
      out.push(a * p[0] + b * p[2] + c * p[4] + d * p[6], a * p[1] + b * p[3] + c * p[5] + d * p[7])
    }
    return out
  }

  // Normalized bbox for shape ops stored as b:[x0,y0,x1,y1] (pixel corners, inclusive)
  R.shapeBox = function (b) {
    return { x: Math.min(b[0], b[2]), y: Math.min(b[1], b[3]), w: Math.abs(b[2] - b[0]) + 1, h: Math.abs(b[3] - b[1]) + 1 }
  }

  R.shapeGeom = function (op) {
    const k = op.k
    if (k === 'line') {
      const p = op.pts
      return [{ pts: [p[0] + 0.5, p[1] + 0.5, p[2] + 0.5, p[3] + 0.5], closed: false }]
    }
    if (k === 'curve') return [{ pts: bezier(op.pts.map(v => v + 0.5), 64), closed: false }]
    if (k === 'polygon') return [{ pts: op.pts.map(v => v + 0.5), closed: true }]
    const box = R.shapeBox(op.b)
    const inset = op.ol && op.ol !== 'none' ? op.s / 2 : 0
    let bx = box.x + inset; let by = box.y + inset
    let bw = box.w - inset * 2; let bh = box.h - inset * 2
    if (bw < 0.5) { bx = box.x + box.w / 2 - 0.25; bw = 0.5 }
    if (bh < 0.5) { by = box.y + box.h / 2 - 0.25; bh = 0.5 }
    const gen = UNIT[k] || UNIT.rect
    return gen(bw, bh).map(u => {
      const pts = new Array(u.length)
      for (let i = 0; i < u.length; i += 2) { pts[i] = bx + u[i] * bw; pts[i + 1] = by + u[i + 1] * bh }
      return { pts, closed: true }
    })
  }

  function geomBox (paths, m, cv) {
    const all = []
    for (const sp of paths) for (const v of sp.pts) all.push(v)
    return bboxPts(all, m, cv)
  }

  function noise1 (v, seed) {
    const i = Math.floor(v); const f = v - i
    const a = U.hash3(i, 7, seed); const b = U.hash3(i + 1, 7, seed)
    const s = f * f * (3 - 2 * f)
    return a + (b - a) * s
  }

  function applyTexture (t, bb, style, seed) {
    if (style === 'marker' || style === 'water') return
    const img = t.getImageData(0, 0, bb.w, bb.h); const d = img.data
    for (let y = 0; y < bb.h; y++) {
      for (let x = 0; x < bb.w; x++) {
        const k = (y * bb.w + x) * 4
        const a = d[k + 3]
        if (!a) continue
        const gx = x + bb.x; const gy = y + bb.y
        if (style === 'crayon') {
          if (U.hash3(gx, gy, seed) >= 0.55) d[k + 3] = 0
        } else if (style === 'npencil') {
          if (U.hash3(gx, gy, seed) >= 0.45) d[k + 3] = 0
          else d[k + 3] = Math.round(a * 0.6)
        } else if (style === 'oil') {
          const f = 0.72 + 0.56 * noise1((gx + gy * 0.35) * 0.3, seed)
          d[k] = U.clamp(Math.round(d[k] * f + (f > 1 ? (f - 1) * 120 : 0)), 0, 255)
          d[k + 1] = U.clamp(Math.round(d[k + 1] * f + (f > 1 ? (f - 1) * 120 : 0)), 0, 255)
          d[k + 2] = U.clamp(Math.round(d[k + 2] * f + (f > 1 ? (f - 1) * 120 : 0)), 0, 255)
        }
      }
    }
    t.putImageData(img, 0, 0)
  }

  function paintPart (dst, op, paths, mode, style, color) {
    const sharp = SHARP.has(op.k)
    const isLine = op.k === 'line' || op.k === 'curve'
    const setup = ctx => {
      ctx.fillStyle = ctx.strokeStyle = U.css(color)
      ctx.lineWidth = op.s
      ctx.lineJoin = sharp ? 'miter' : 'round'
      ctx.miterLimit = 10
      ctx.lineCap = isLine ? (op.s >= 3 ? 'round' : 'square') : 'butt'
    }
    const trace = (ctx, ox, oy) => {
      ctx.beginPath()
      for (const sp of paths) {
        const p = sp.pts
        ctx.moveTo(p[0] + ox, p[1] + oy)
        for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i] + ox, p[i + 1] + oy)
        if (sp.closed) ctx.closePath()
      }
    }
    if (style === 'solid') {
      setup(dst); trace(dst, 0, 0)
      if (mode === 'fill') dst.fill(); else dst.stroke()
      return
    }
    const bb = geomBox(paths, (mode === 'stroke' ? op.s : 0) + 10, dst.canvas)
    if (!bb) return
    const t = tmp('shape', bb.w, bb.h)
    setup(t); trace(t, -bb.x, -bb.y)
    if (mode === 'fill') t.fill(); else t.stroke()
    applyTexture(t, bb, style, (op.seed || 1) ^ (mode === 'fill' ? 0x5bd1e995 : 0))
    dst.save()
    if (style === 'marker') dst.globalAlpha = 0.5
    if (style === 'water') { dst.globalAlpha = 0.4; dst.filter = 'blur(1.5px)' }
    dst.drawImage(t.canvas, 0, 0, bb.w, bb.h, bb.x, bb.y, bb.w, bb.h)
    dst.restore()
  }

  R.drawShape = function (dst, op) {
    const paths = R.shapeGeom(op)
    const closed = paths[0].closed
    if (closed && op.fl && op.fl !== 'none') paintPart(dst, op, paths, 'fill', op.fl, op.c2)
    if (op.ol && op.ol !== 'none') paintPart(dst, op, paths, 'stroke', op.ol, op.c1)
  }

  // SVG path for gallery icons
  R.shapeIcon = function (k, size) {
    size = size || 16
    const m = 1.5; const s = size - m * 2
    const f = v => (m + v * s).toFixed(2)
    if (k === 'line') return 'M' + f(0) + ' ' + f(1) + 'L' + f(1) + ' ' + f(0)
    if (k === 'curve') return 'M' + f(0) + ' ' + f(0.85) + 'C' + f(0.2) + ' ' + f(-0.2) + ' ' + f(0.6) + ' ' + f(1.3) + ' ' + f(1) + ' ' + f(0.1)
    let sub
    if (k === 'polygon') sub = [[0.1, 0.15, 0.7, 0, 1, 0.45, 0.55, 1, 0, 0.75]]
    else sub = (UNIT[k] || UNIT.rect)(s, s)
    let d = ''
    for (const u of sub) {
      d += 'M' + f(u[0]) + ' ' + f(u[1])
      for (let i = 2; i < u.length; i += 2) d += 'L' + f(u[i]) + ' ' + f(u[i + 1])
      d += 'Z'
    }
    return d
  }

  // ---------- regions (selection) ----------
  R.regionMask = function (region, W, H) {
    if (!region) return null
    if (region.k === 'rect') {
      const x0 = Math.max(0, region.x); const y0 = Math.max(0, region.y)
      const x1 = Math.min(W, region.x + region.w); const y1 = Math.min(H, region.y + region.h)
      if (x1 <= x0 || y1 <= y0) return null
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, m: null }
    }
    if (region.k === 'poly') {
      const p = region.pts
      let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity
      for (let i = 0; i < p.length; i += 2) {
        x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1])
      }
      x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W - 1, x1); y1 = Math.min(H - 1, y1)
      if (x1 < x0 || y1 < y0) return null
      const w = x1 - x0 + 1; const h = y1 - y0 + 1
      const m = new Uint8Array(w * h)
      const n = p.length >> 1
      const xs = []
      for (let yy = 0; yy < h; yy++) {
        const yc = yy + y0 + 0.5
        xs.length = 0
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const ay = p[2 * j + 1] + 0.5; const by = p[2 * i + 1] + 0.5
          if ((ay > yc) !== (by > yc)) {
            const ax = p[2 * j] + 0.5; const bx = p[2 * i] + 0.5
            xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax))
          }
        }
        xs.sort((a, b) => a - b)
        for (let q = 0; q + 1 < xs.length; q += 2) {
          const xa = Math.max(x0, Math.ceil(xs[q] - 0.5)); const xb = Math.min(x1, Math.floor(xs[q + 1] - 0.5))
          for (let xx = xa; xx <= xb; xx++) m[yy * w + xx - x0] = 1
        }
      }
      for (let i = 0, j = n - 1; i < n; j = i++) {
        line(p[2 * j], p[2 * j + 1], p[2 * i], p[2 * i + 1], (x, y) => {
          if (x >= x0 && x <= x1 && y >= y0 && y <= y1) m[(y - y0) * w + x - x0] = 1
        })
      }
      return { x: x0, y: y0, w, h, m }
    }
    if (region.k === 'inv') {
      const inner = R.regionMask(region.of, W, H)
      const m = new Uint8Array(W * H).fill(1)
      if (inner) {
        for (let yy = 0; yy < inner.h; yy++) {
          for (let xx = 0; xx < inner.w; xx++) {
            if (!inner.m || inner.m[yy * inner.w + xx]) m[(yy + inner.y) * W + xx + inner.x] = 0
          }
        }
      }
      return { x: 0, y: 0, w: W, h: H, m }
    }
    return null
  }

  R.regionBox = function (region, W, H) {
    const r = R.regionMask(region, W, H)
    return r ? { x: r.x, y: r.y, w: r.w, h: r.h } : null
  }

  R.fillRegion = function (dst, region, color) {
    const W = dst.canvas.width; const H = dst.canvas.height
    const r = R.regionMask(region, W, H)
    if (!r) return
    if (!r.m) { dst.fillStyle = U.css(color); dst.fillRect(r.x, r.y, r.w, r.h); return }
    const t = tmp('reg', r.w, r.h)
    const img = t.createImageData(r.w, r.h); const d32 = new Uint32Array(img.data.buffer); const c = U.packRGBA(color)
    for (let i = 0; i < r.m.length; i++) if (r.m[i]) d32[i] = c
    t.putImageData(img, 0, 0)
    dst.drawImage(t.canvas, 0, 0, r.w, r.h, r.x, r.y, r.w, r.h)
  }

  R.extractRegion = function (src, region) {
    const W = src.canvas.width; const H = src.canvas.height
    const r = R.regionMask(region, W, H)
    if (!r) return null
    const img = src.getImageData(r.x, r.y, r.w, r.h)
    if (r.m) for (let i = 0; i < r.m.length; i++) if (!r.m[i]) img.data[i * 4 + 3] = 0
    const c = U.canvas(r.w, r.h)
    c.getContext('2d').putImageData(img, 0, 0)
    return { canvas: c, x: r.x, y: r.y, w: r.w, h: r.h }
  }

  R.invertRegion = function (dst, region) {
    const W = dst.canvas.width; const H = dst.canvas.height
    const r = region ? R.regionMask(region, W, H) : { x: 0, y: 0, w: W, h: H, m: null }
    if (!r) return
    const img = dst.getImageData(r.x, r.y, r.w, r.h); const d = img.data
    for (let i = 0, n = r.w * r.h; i < n; i++) {
      if (r.m && !r.m[i]) continue
      const k = i * 4
      d[k] = 255 - d[k]; d[k + 1] = 255 - d[k + 1]; d[k + 2] = 255 - d[k + 2]
    }
    dst.putImageData(img, r.x, r.y)
  }

  R.drawStamp = function (dst, op) {
    if (op.cut) R.fillRegion(dst, op.cut, op.cc)
    if (op._img) {
      const iw = op._img.width; const ih = op._img.height
      dst.save()
      dst.imageSmoothingEnabled = !(iw === op.w && ih === op.h)
      dst.imageSmoothingQuality = 'high'
      dst.drawImage(op._img, op.x, op.y, op.w, op.h)
      dst.restore()
    }
  }

  // Render an op onto an overlay (preview / pending / remote layers)
  R.drawPreview = function (dst, op, src) {
    switch (op.t) {
      case 'stroke': R.drawStroke(dst, op, 0, src); break
      case 'shape': R.drawShape(dst, op); break
      case 'fill': R.floodFill(dst, src, op.x, op.y, op.c); break
      case 'stamp': R.drawStamp(dst, op); break
    }
  }
})(window.P)
