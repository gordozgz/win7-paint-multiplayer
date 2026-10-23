'use strict'
window.P = window.P || {};

(function (P) {
  const U = P.util = {}

  U.$ = (sel, root) => (root || document).querySelector(sel)
  U.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel))

  // h('div.cls#id', {attrs}, ...children); text, titles and string children
  // go through the UI translation (P.T)
  const T = s => (P.T ? P.T(s) : s)
  U.h = function (spec, attrs, ...kids) {
    const m = spec.match(/^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i)
    const el = document.createElement((m && m[1]) || 'div')
    if (m && m[2]) {
      for (const part of m[2].match(/[.#][\w-]+/g)) {
        if (part[0] === '.') el.classList.add(part.slice(1))
        else el.id = part.slice(1)
      }
    }
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k]
        if (v == null || v === false) continue
        if (k === 'style' && typeof v === 'object') Object.assign(el.style, v)
        else if (k === 'html') el.innerHTML = T(v)
        else if (k === 'text') el.textContent = T(v)
        else if (k === 'title') el.setAttribute('title', T(v))
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v)
        else if (k === 'dataset') Object.assign(el.dataset, v)
        else if (v === true) el.setAttribute(k, '')
        else el.setAttribute(k, v)
      }
    }
    for (const k of kids.flat()) {
      if (k == null || k === false) continue
      el.appendChild(typeof k === 'string' ? document.createTextNode(T(k)) : typeof k === 'number' ? document.createTextNode(String(k)) : k)
    }
    return el
  }

  U.clamp = (v, a, b) => Math.max(a, Math.min(b, v))
  U.css = c => 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'
  U.hex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('')
  U.fromHex = s => { s = s.replace('#', ''); return [0, 2, 4].map(i => parseInt(s.substr(i, 2), 16)) }
  U.eq = (a, b) => a && b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2]
  U.packRGBA = c => ((255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0

  U.rng = function (seed) {
    let a = seed >>> 0
    return function () {
      a = (a + 0x6D2B79F5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  U.hash3 = function (x, y, s) {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s | 0, 1442695041)) | 0
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }

  U.randSeed = () => (Math.random() * 0x7fffffff) | 0

  U.canvas = function (w, h) {
    const c = document.createElement('canvas')
    c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0)
    return c
  }

  U.loadImage = function (src) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error(T('Не удалось прочитать изображение')))
      img.src = src
    })
  }

  U.fnv = function (u8) {
    const d = new Uint32Array(u8.buffer, u8.byteOffset, u8.byteLength >> 2)
    let h = 0x811c9dc5
    for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619)
    return (h >>> 0).toString(16)
  }

  U.fmtSize = function (bytes) {
    if (bytes == null) return ''
    const num = v => P.i18n ? P.i18n.num(v) : v
    if (bytes < 1024) return P.T('{n} байт', { n: bytes })
    const kb = bytes / 1024
    if (kb < 1024) return P.T('{n} КБ', { n: num(kb.toFixed(1)) })
    return P.T('{n} МБ', { n: num((kb / 1024).toFixed(1)) })
  }

  // Windows color dialog HSL (0..239 hue, 0..240 sat/lum)
  U.rgbToHsl240 = function (c) {
    const r = c[0] / 255; const g = c[1] / 255; const b = c[2] / 255
    const max = Math.max(r, g, b); const min = Math.min(r, g, b)
    const l = (max + min) / 2
    let h = 0; let s = 0
    if (max !== min) {
      const d = max - min
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
      else if (max === g) h = (b - r) / d + 2
      else h = (r - g) / d + 4
      h /= 6
    }
    return [Math.round(h * 240) % 240, Math.round(s * 240), Math.round(l * 240)]
  }
  U.hsl240ToRgb = function (H, S, L) {
    const h = H / 240; const s = S / 240; const l = L / 240
    if (s === 0) { const v = Math.round(l * 255); return [v, v, v] }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    const f = t => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1 / 6) return p + (q - p) * 6 * t
      if (t < 1 / 2) return q
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
      return p
    }
    return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)]
  }

  U.emitter = function (obj) {
    const map = new Map()
    obj.on = (ev, fn) => { if (!map.has(ev)) map.set(ev, []); map.get(ev).push(fn) }
    obj.emit = (ev, ...a) => { const l = map.get(ev); if (l) for (const fn of l.slice()) fn(...a) }
    return obj
  }

  U.stringify = obj => JSON.stringify(obj, (k, v) => (k && k[0] === '_') ? undefined : v)

  U.dataURLToBytes = function (url) {
    const b64 = url.slice(url.indexOf(',') + 1)
    const bin = atob(b64)
    const u8 = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
    return u8
  }

  // 24-bit BMP encoder (bottom-up, padded rows)
  U.encodeBMP = function (canvas) {
    const w = canvas.width; const h = canvas.height
    const data = canvas.getContext('2d').getImageData(0, 0, w, h).data
    const rowSize = Math.ceil((w * 3) / 4) * 4
    const size = 54 + rowSize * h
    const buf = new ArrayBuffer(size)
    const dv = new DataView(buf)
    const u8 = new Uint8Array(buf)
    u8[0] = 0x42; u8[1] = 0x4d
    dv.setUint32(2, size, true)
    dv.setUint32(10, 54, true)
    dv.setUint32(14, 40, true)
    dv.setInt32(18, w, true)
    dv.setInt32(22, h, true)
    dv.setUint16(26, 1, true)
    dv.setUint16(28, 24, true)
    dv.setUint32(34, rowSize * h, true)
    dv.setInt32(38, 3780, true)
    dv.setInt32(42, 3780, true)
    for (let y = 0; y < h; y++) {
      let o = 54 + (h - 1 - y) * rowSize
      let s = y * w * 4
      for (let x = 0; x < w; x++, s += 4) {
        u8[o++] = data[s + 2]; u8[o++] = data[s + 1]; u8[o++] = data[s]
      }
    }
    return u8
  }

  U.canvasToBlobBytes = function (canvas, mime, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(b => {
        if (!b) return reject(new Error('encode failed'))
        b.arrayBuffer().then(ab => resolve(new Uint8Array(ab)), reject)
      }, mime, quality)
    })
  }

  U.isMac = /Mac/.test(navigator.platform)
})(window.P)
