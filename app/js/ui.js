'use strict';
// Ribbon, dropdown menus, palette, galleries, status bar, file menu.
(function (P) {
  const U = P.util
  const R = P.raster
  const $ = U.$
  const h = U.h

  const UI = P.ui = U.emitter({})

  UI.injectIcons = function (root) {
    for (const el of U.$$('[data-icon]', root)) {
      const ic = P.icons[el.dataset.icon]
      if (ic) el.insertAdjacentHTML('afterbegin', ic)
    }
  }

  // ------------------------------------------------------------ menus
  const layer = () => $('#layer-menus')
  let stack = []
  let anchorEl = null

  UI.closeMenus = function () {
    for (const m of stack) m.el.remove()
    stack = []
    if (anchorEl) { anchorEl.classList.remove('open'); anchorEl = null }
    $('#fileTab').classList.remove('open')
  }
  UI.menuOpen = () => stack.length > 0

  function closeFrom (level) {
    while (stack.length > level) {
      const m = stack.pop()
      m.el.remove()
      if (m.parentItem) m.parentItem.classList.remove('open')
    }
  }

  function buildMenu (items, level) {
    const el = h('div.menu')
    for (const it of items) {
      if (!it) continue
      if (it.sep) { el.appendChild(h('div.msep')); continue }
      if (it.head) { el.appendChild(h('div.mhead', { text: it.head })); continue }
      if (it.el) { el.appendChild(it.el); continue }
      const row = h('div.mi' + (it.big ? '.big-mi' : '') + (it.disabled ? '.disabled' : '') + (it.checked ? '.checked' : ''),
        null,
        h('span.mic', { html: it.icon ? (P.icons[it.icon] || it.icon) : '' }),
        h('span.mlabel', { html: it.desc ? '<span>' + P.T(it.label) + '</span><span class="mdesc">' + P.T(it.desc) + '</span>' : P.T(it.label) }),
        it.shortcut ? h('span.msc', { text: it.shortcut }) : null,
        it.sub ? h('span.msub', { html: P.icons.arrowRight }) : null)
      if (it.title) row.title = it.title
      row.addEventListener('pointerenter', () => {
        closeFrom(level + 1)
        if (it.sub && !it.disabled) {
          row.classList.add('open')
          const r = row.getBoundingClientRect()
          openAt(typeof it.sub === 'function' ? it.sub() : it.sub, { x: r.right - 2, y: r.top - 3 }, level + 1, row)
        }
      })
      row.addEventListener('click', e => {
        e.stopPropagation()
        if (it.disabled || it.sub) return
        UI.closeMenus()
        if (it.action) it.action()
      })
      el.appendChild(row)
    }
    return el
  }

  function place (el, pos) {
    layer().appendChild(el)
    const w = el.offsetWidth; const hh = el.offsetHeight
    let x = pos.x; let y = pos.y
    if (x + w > window.innerWidth - 2) x = Math.max(2, (pos.alignRight != null ? pos.alignRight : window.innerWidth) - w - 2)
    if (y + hh > window.innerHeight - 2) y = Math.max(2, (pos.above != null ? pos.above - hh : window.innerHeight - hh - 2))
    el.style.left = x + 'px'; el.style.top = y + 'px'
  }

  function openAt (items, pos, level, parentItem) {
    const el = Array.isArray(items) ? buildMenu(items, level) : items
    if (!Array.isArray(items)) el.classList.add('menu')
    place(el, pos)
    stack.push({ el, parentItem })
    return el
  }

  // Open a dropdown under an anchor element
  UI.dropdown = function (anchor, items) {
    UI.closeMenus()
    if (!items) return
    anchorEl = anchor
    anchor.classList.add('open')
    const r = anchor.getBoundingClientRect()
    return openAt(items, { x: r.left, y: r.bottom, above: r.top, alignRight: r.right }, 0)
  }

  UI.contextMenu = function (x, y, items) {
    UI.closeMenus()
    return openAt(items, { x, y, above: y }, 0)
  }

  document.addEventListener('pointerdown', e => {
    if (!stack.length) return
    if (stack.some(m => m.el.contains(e.target))) return
    if (anchorEl && anchorEl.contains(e.target)) return
    UI.closeMenus()
  }, true)
  window.addEventListener('blur', () => UI.closeMenus())
  window.addEventListener('resize', () => UI.closeMenus())

  // ------------------------------------------------------------ ribbon
  UI.initRibbon = function () {
    const tabs = U.$$('#tabs .tab')
    for (const t of tabs) {
      t.addEventListener('click', () => {
        const rb = $('#ribbon')
        if (rb.classList.contains('collapsed')) {
          if (t.classList.contains('active') && rb.classList.contains('peek')) { rb.classList.remove('peek'); return }
          rb.classList.add('peek')
        }
        UI.showTab(t.dataset.tab)
      })
      t.addEventListener('dblclick', () => UI.toggleRibbon())
    }
    $('#ribbonToggle').addEventListener('click', () => UI.toggleRibbon())
    document.addEventListener('pointerdown', e => {
      const rb = $('#ribbon')
      if (rb.classList.contains('peek') && !rb.contains(e.target) && !$('#tabs').contains(e.target) && !layer().contains(e.target)) rb.classList.remove('peek')
    })
    $('#helpBtn').addEventListener('click', () => P.dialogs.about())
  }

  UI.showTab = function (name) {
    for (const t of U.$$('#tabs .tab')) t.classList.toggle('active', t.dataset.tab === name)
    for (const p of U.$$('#ribbon .panel')) p.classList.toggle('hidden', p.dataset.panel !== name)
    UI.currentTab = name
  }

  UI.toggleRibbon = function () {
    const rb = $('#ribbon')
    rb.classList.toggle('collapsed')
    rb.classList.remove('peek')
    $('#ribbonToggle').innerHTML = P.icons[rb.classList.contains('collapsed') ? 'expand' : 'collapse']
    P.view.drawRulers()
  }

  UI.showTextTab = function (on) {
    const t = $('#tabs .tab.ctx')
    t.classList.toggle('hidden', !on)
    if (on) UI.showTab('text')
    else if (UI.currentTab === 'text') UI.showTab('home')
  }

  // ------------------------------------------------------------ palette
  UI.PALETTE = [
    [0, 0, 0], [127, 127, 127], [136, 0, 21], [237, 28, 36], [255, 127, 39], [255, 242, 0], [34, 177, 76], [0, 162, 232], [63, 72, 204], [163, 73, 164],
    [255, 255, 255], [195, 195, 195], [185, 122, 87], [255, 174, 201], [255, 201, 14], [239, 228, 176], [181, 230, 29], [153, 217, 234], [112, 146, 190], [200, 191, 231]
  ]
  UI.PALETTE_NAMES = ['Черный', 'Серый 50%', 'Темно-красный', 'Красный', 'Оранжевый', 'Желтый', 'Зеленый', 'Бирюзовый', 'Индиго', 'Фиолетовый',
    'Белый', 'Серый 25%', 'Коричневый', 'Розовый', 'Золотой', 'Светло-желтый', 'Лайм', 'Светло-бирюзовый', 'Сизый', 'Лавандовый']

  UI.renderPalette = function () {
    const A = P.app
    for (const box of [$('#palette'), $('.palette2')]) {
      box.innerHTML = ''
      for (let i = 0; i < 30; i++) {
        const c = i < 20 ? UI.PALETTE[i] : A.custom[i - 20]
        const rgb = c ? { r: c[0], g: c[1], b: c[2] } : null
        const tip = i < 20
          ? P.T('{name}\nКрасный: {r}, зеленый: {g}, синий: {b}', Object.assign({ name: P.T(UI.PALETTE_NAMES[i]) }, rgb))
          : (c ? P.T('Красный: {r}, зеленый: {g}, синий: {b}', rgb) : '')
        const cell = h('div.pal' + (c ? '' : '.empty'), { title: tip }, h('span', { style: c ? { background: U.css(c) } : null }))
        cell.addEventListener('pointerdown', e => {
          if (!c) return
          e.preventDefault()
          if (e.button === 2) A.setColor(2, c)
          else if (e.button === 0) A.setColor(A.slot, c)
        })
        cell.addEventListener('contextmenu', e => e.preventDefault())
        box.appendChild(cell)
      }
    }
  }

  UI.updateColors = function () {
    const A = P.app
    for (const el of U.$$('#sw1, .sw1')) el.style.background = U.css(A.color1)
    for (const el of U.$$('#sw2, .sw2')) el.style.background = U.css(A.color2)
    for (const b of U.$$('.colorslot')) b.classList.toggle('on', Number(b.dataset.slot) === A.slot)
  }

  // ------------------------------------------------------------ shapes gallery
  let galRow = 0
  UI.renderShapes = function () {
    const A = P.app
    const box = $('#shapeGallery .gal-items')
    box.innerHTML = ''
    R.SHAPES.forEach(k => {
      const it = h('div.gal-item' + (A.tool === 'shape' && A.shape === k ? '.on' : ''), { title: R.SHAPE_NAMES[k], dataset: { shape: k } })
      it.innerHTML = '<svg viewBox="0 0 16 16"><path d="' + R.shapeIcon(k) + '" fill="none" stroke="#1f1f1f" stroke-width="1" stroke-linejoin="round"/></svg>'
      it.addEventListener('click', () => A.selectShape(k))
      box.appendChild(it)
    })
    box.scrollTop = galRow * 20
    UI.updateGalleryArrows()
  }
  UI.updateGalleryArrows = function () {
    const rows = Math.ceil(R.SHAPES.length / 7)
    $('#shapeGallery .gal-up').classList.toggle('disabled', galRow <= 0)
    $('#shapeGallery .gal-down').classList.toggle('disabled', galRow >= rows - 3)
  }
  UI.initGallery = function () {
    const rows = Math.ceil(R.SHAPES.length / 7)
    $('#shapeGallery .gal-up').addEventListener('click', () => { galRow = Math.max(0, galRow - 1); $('#shapeGallery .gal-items').scrollTop = galRow * 20; UI.updateGalleryArrows() })
    $('#shapeGallery .gal-down').addEventListener('click', () => { galRow = Math.min(rows - 3, galRow + 1); $('#shapeGallery .gal-items').scrollTop = galRow * 20; UI.updateGalleryArrows() })
    $('#shapeGallery .gal-more').addEventListener('click', e => {
      const A = P.app
      const grid = h('div.tile-gallery', { style: { gridTemplateColumns: 'repeat(7, 24px)' } })
      R.SHAPES.forEach(k => {
        const t = h('div.tile' + (A.tool === 'shape' && A.shape === k ? '.on' : ''), { title: R.SHAPE_NAMES[k], style: { width: '24px', height: '24px' } })
        t.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16"><path d="' + R.shapeIcon(k) + '" fill="none" stroke="#1f1f1f" stroke-width="1" stroke-linejoin="round"/></svg>'
        t.addEventListener('click', () => { UI.closeMenus(); A.selectShape(k) })
        grid.appendChild(t)
      })
      const r = $('#shapeGallery').getBoundingClientRect()
      UI.closeMenus()
      const m = UI.contextMenu(r.left, r.top, [{ el: grid }])
      m.style.left = r.left + 'px'
      e.stopPropagation()
    })
  }

  // brush samples rendered with the real brush code
  const brushSampleCache = {}
  UI.brushSample = function (b, w, hh, color) {
    const key = b + w + 'x' + hh + (color || '')
    if (brushSampleCache[key]) return brushSampleCache[key]
    const c = U.canvas(w, hh)
    const ctx = c.getContext('2d', { willReadFrequently: true })
    const pts = []
    for (let i = 0; i <= 24; i++) {
      const t = i / 24
      pts.push(Math.round(4 + t * (w - 8)), Math.round(hh / 2 + Math.sin(t * Math.PI * 2) * (hh / 2 - 7)))
    }
    if (b === 'air') for (let i = 0; i < 16; i += 2) pts.push(pts[pts.length - 2], pts[pts.length - 1])
    const op = { t: 'stroke', tool: 'brush', brush: b, s: 3, c: color || [0, 0, 0], p: pts, seed: 12345 }
    R.drawStroke(ctx, op, 0, ctx)
    const url = c.toDataURL()
    brushSampleCache[key] = url
    return url
  }

  // ------------------------------------------------------------ status bar
  UI.status = function (key, text) {
    const el = $('#sb' + key)
    if (el && el.textContent !== text) el.textContent = text || ''
  }

  UI.initZoomSlider = function () {
    const V = P.view
    const slider = $('#zoomSlider')
    const thumb = slider.querySelector('.thumb')
    const Z = V.ZOOMS
    // map: 12.5%..100% on left 30% of track, 100%..800% on the rest
    const toPos = z => z <= 1 ? (Math.log2(z) + 3) / 3 * 0.3 : 0.3 + ((z - 1) / 7) * 0.7
    const fromPos = p => {
      let best = Z[0]; let bd = 9
      for (const z of Z) { const d = Math.abs(toPos(z) - p); if (d < bd) { bd = d; best = z } }
      return best
    }
    const sync = () => {
      thumb.style.left = (toPos(V.zoom) * 100) + '%'
      $('#zoomText').textContent = (Math.round(V.zoom * 1000) / 10).toString().replace('.', ',') + '%'
    }
    V.on('zoom', sync)
    sync()
    slider.addEventListener('pointerdown', e => {
      slider.setPointerCapture(e.pointerId)
      const go = ev => {
        const r = slider.getBoundingClientRect()
        V.setZoom(fromPos(U.clamp((ev.clientX - r.left) / r.width, 0, 1)))
      }
      go(e)
      const mv = ev => go(ev)
      const up = () => { slider.removeEventListener('pointermove', mv); slider.removeEventListener('pointerup', up) }
      slider.addEventListener('pointermove', mv)
      slider.addEventListener('pointerup', up)
    })
    $('#zoomInBtn').addEventListener('click', () => V.zoomStep(1))
    $('#zoomOutBtn').addEventListener('click', () => V.zoomStep(-1))
  }

  // ------------------------------------------------------------ file menu
  UI.openFileMenu = function () {
    const A = P.app
    if ($('#fileTab').classList.contains('open')) { UI.closeMenus(); return }
    UI.closeMenus()
    $('#fileTab').classList.add('open')
    anchorEl = $('#fileTab')
    const right = h('div.fm-right')
    const showRecent = () => {
      right.innerHTML = ''
      right.appendChild(h('div.fm-head', { text: 'Последние изображения' }))
      const rec = A.recentFiles()
      if (!rec.length) right.appendChild(h('div.muted', { style: { padding: '6px' }, text: 'Список пуст' }))
      rec.forEach((p, i) => {
        const name = p.split(/[\\/]/).pop()
        const row = h('div.fm-recent', { title: p }, h('u', { text: String(i + 1) }), name)
        row.addEventListener('click', () => { UI.closeMenus(); A.openRecent(p) })
        right.appendChild(row)
      })
    }
    const showSub = (head, items) => {
      right.innerHTML = ''
      right.appendChild(h('div.fm-head', { text: head }))
      const box = h('div.fm-sub')
      for (const it of items) {
        const row = h('div.fm-item' + (it.disabled ? '.disabled' : ''), null, h('span', { html: P.icons[it.icon] }), h('span.mlabel', { html: '<b>' + P.T(it.label) + '</b>' + (it.desc ? '<span>' + P.T(it.desc) + '</span>' : '') }))
        row.addEventListener('click', () => { if (it.disabled) return; UI.closeMenus(); it.action() })
        box.appendChild(row)
      }
      right.appendChild(box)
    }
    const items = [
      { icon: 'fileNew', label: 'Создать', sc: 'Ctrl+N', action: () => A.cmd('new') },
      { icon: 'fileOpen', label: 'Открыть', sc: 'Ctrl+O', action: () => A.cmd('open') },
      { icon: 'fileSave', label: 'Сохранить', sc: 'Ctrl+S', action: () => A.cmd('save') },
      {
        icon: 'fileSaveAs',
        label: 'Сохранить как',
        sub: () => showSub('Сохранить копию документа', [
          { icon: 'fmtPNG', label: 'Изображение в формате PNG', desc: 'Сохранение фотографии или рисунка с высоким качеством.', action: () => A.saveAs('png') },
          { icon: 'fmtJPG', label: 'Изображение в формате JPEG', desc: 'Сохранение фотографии со сжатием для интернета.', action: () => A.saveAs('jpg') },
          { icon: 'fmtBMP', label: 'Изображение в формате BMP', desc: 'Сохранение любого рисунка с высоким качеством.', action: () => A.saveAs('bmp') },
          { icon: 'fmtGIF', label: 'Изображение в формате GIF', desc: 'Не поддерживается в этой версии.', disabled: true },
          { icon: 'fmtOther', label: 'Другие форматы', desc: 'Открыть диалоговое окно «Сохранить как» для выбора формата.', action: () => A.saveAs(null) }
        ]),
        action: () => A.saveAs(null)
      },
      { sep: true },
      { icon: 'filePrint', label: 'Печать', disabled: true },
      { icon: 'fileScan', label: 'Со сканера или камеры', disabled: true },
      { icon: 'fileMail', label: 'Отправить по электронной почте', disabled: true },
      { icon: 'fileDesktop', label: 'Сделать фоном рабочего стола', disabled: true },
      { sep: true },
      { icon: 'fileProps', label: 'Свойства', sc: 'Ctrl+E', action: () => A.cmd('properties') },
      { icon: 'fileAbout', label: 'О программе Paint', action: () => P.dialogs.about() },
      { sep: true },
      { icon: 'fileExit', label: 'Выход', action: () => A.cmd('exit') }
    ]
    const left = h('div.fm-left')
    for (const it of items) {
      if (it.sep) { left.appendChild(h('div.fm-sep')); continue }
      const row = h('div.fm-item' + (it.disabled ? '.disabled' : ''), { title: it.sc ? P.T(it.label) + ' (' + it.sc + ')' : '' },
        h('span', { html: P.icons[it.icon] }), h('span', { text: it.label }), it.sub ? h('span.msub', { html: P.icons.arrowRight }) : null)
      row.addEventListener('pointerenter', () => {
        U.$$('.fm-item.open', left).forEach(x => x.classList.remove('open'))
        if (it.sub && !it.disabled) { row.classList.add('open'); it.sub() } else showRecent()
      })
      row.addEventListener('click', () => { if (it.disabled) return; UI.closeMenus(); it.action() })
      left.appendChild(row)
    }
    showRecent()
    const el = h('div.filemenu', null, left, right)
    const top = $('#fileTab').getBoundingClientRect().bottom
    el.style.top = top + 'px'
    layer().appendChild(el)
    stack.push({ el })
  }
})(window.P)
