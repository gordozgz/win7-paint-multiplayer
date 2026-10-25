'use strict';
(function (P) {
  const U = P.util
  const R = P.raster
  const D = P.doc
  const S = P.net
  const V = P.view
  const UI = P.ui
  const Dl = P.dialogs
  const T = P.tools
  const $ = U.$
  const h = U.h
  const native = window.native || null

  const A = P.app = {
    color1: [0, 0, 0],
    color2: [255, 255, 255],
    slot: 1,
    custom: new Array(10).fill(null),
    customNext: 0,
    dlgCustom: new Array(16).fill(null),
    tool: 'pencil',
    prevTool: 'pencil',
    sizes: { pencil: 1, brush: 3, eraser: 8, shape: 1 },
    brush: 'brush',
    shape: 'rect',
    outline: 'solid',
    fill: 'none',
    selMode: 'rect',
    transparentSel: false,
    resample: 'nearest',
    text: { font: 'Calibri', size: 11, b: false, i: false, u: false, s: false, opaque: false },
    file: { name: null, path: null, size: null, saved: null },
    dirty: false,
    version: '1.0.0'
  }

  const FONTS = ['Arial', 'Arial Black', 'Bahnschrift', 'Calibri', 'Calibri Light', 'Cambria', 'Candara', 'Comic Sans MS', 'Consolas',
    'Constantia', 'Corbel', 'Courier New', 'Franklin Gothic Medium', 'Gabriola', 'Georgia', 'Impact', 'Lucida Console',
    'Lucida Sans Unicode', 'Microsoft Sans Serif', 'Palatino Linotype', 'Segoe Print', 'Segoe Script', 'Segoe UI',
    'Sylfaen', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Webdings', 'Wingdings']
  const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72]

  // ------------------------------------------------------------ state setters
  A.setColor = function (slot, c) {
    if (slot === 1) A.color1 = c.slice(); else A.color2 = c.slice()
    UI.updateColors()
    T.refresh()
  }

  A.setTool = function (name) {
    if (name === A.tool) { T.setCursorFor(); return }
    T.commitAll()
    if (name === 'picker') A.prevTool = A.tool
    else if (A.tool !== 'picker') A.prevTool = A.tool
    A.tool = name
    A.updateToolUI()
    T.setCursorFor()
    if (name !== 'text') UI.showTextTab(false)
  }

  A.selectShape = function (k) {
    A.shape = k
    if (A.tool === 'shape') T.shape.refresh()
    A.setTool('shape')
    A.updateToolUI()
  }

  A.sizeKey = function () {
    if (A.tool === 'pencil') return 'pencil'
    if (A.tool === 'brush') return 'brush'
    if (A.tool === 'eraser') return 'eraser'
    if (A.tool === 'shape') return 'shape'
    return null
  }

  A.changeSize = function (delta) {
    const k = A.sizeKey()
    if (!k) return
    A.sizes[k] = U.clamp(A.sizes[k] + delta, 1, k === 'eraser' ? 100 : 50)
    T.refresh()
  }

  // how selections and the picture are scaled (remembered between runs)
  A.setResample = function (mode) {
    if (!R.RESAMPLE.includes(mode)) return
    A.resample = mode
    try { localStorage.setItem('mp-paint-resample', mode) } catch (e) {}
    T.select.refresh()
  }

  A.toggleText = function (key) {
    A.text[key] = !A.text[key]
    A.updateTextUI()
    T.text.refresh()
    T.text.focus()
  }

  A.updateToolUI = function () {
    for (const b of U.$$('.tool[data-tool]')) b.classList.toggle('on', b.dataset.tool === A.tool)
    $('#selectBtn').classList.toggle('on', A.tool === 'select')
    $('#brushBtn').classList.toggle('on', A.tool === 'brush')
    UI.renderShapes()
    $('#brushIcon').innerHTML = '<img width="32" height="32" src="' + UI.brushSample(A.brush, 32, 32) + '">'
    const sk = A.sizeKey()
    $('#sizeBtn').classList.toggle('disabled', !sk)
    $('#outlineBtn').classList.toggle('disabled', A.tool !== 'shape')
    $('#fillBtn').classList.toggle('disabled', A.tool !== 'shape')
    A.updateCommands()
  }

  A.updateTextUI = function () {
    $('#fontFamily').value = A.text.font
    $('#fontSize').value = String(A.text.size)
    $('#btnBold').classList.toggle('on', A.text.b)
    $('#btnItalic').classList.toggle('on', A.text.i)
    $('#btnUnderline').classList.toggle('on', A.text.u)
    $('#btnStrike').classList.toggle('on', A.text.s)
    $('#btnOpaque').classList.toggle('on', A.text.opaque)
    $('#btnTransparent').classList.toggle('on', !A.text.opaque)
  }

  A.updateCommands = function () {
    const hasSel = T.select.active()
    for (const el of U.$$('[data-cmd="crop"], [data-cmd="cut"], [data-cmd="copy"]')) el.classList.toggle('disabled', !hasSel && !(el.dataset.cmd !== 'crop' && T.text.active()))
    U.$$('.qbtn[data-cmd="undo"]').forEach(b => b.classList.toggle('disabled', !S.canUndo() && !T.select.active() && !T.shape.active()))
    U.$$('.qbtn[data-cmd="redo"]').forEach(b => b.classList.toggle('disabled', !S.canRedo()))
    const online = S.isOnline()
    const set = (cmd, on) => U.$$('[data-cmd="' + cmd + '"]').forEach(b => b.classList.toggle('disabled', !on))
    set('mpInvite', online && S.transport && S.transport.kind === 'steam')
    set('mpCopyCode', online)
    set('mpLeave', online)
    set('mpCreate', S.available && !online)
    set('mpBrowse', S.available)
    set('mpJoinCode', S.available)
    U.$$('[data-menu="lobbyType"]').forEach(b => b.classList.toggle('disabled', !S.available || online))
  }

  A.updateTitle = function () {
    const name = A.file.name || P.T('Безымянный')
    const t = name + ' - Paint'
    $('#title').textContent = t
    document.title = t
    if (native) native.setTitle(t)
  }

  A.updateStatus = function () {
    UI.status('Size', P.T('{w} × {h}пкс', { w: D.width(), h: D.height() }))
    UI.status('File', A.file.size != null ? P.T('Размер: {size}', { size: U.fmtSize(A.file.size) }) : '')
    const wrap = $('#sbNetWrap')
    let txt = P.T('Не в сети')
    if (!S.available) txt = P.T(S.error ? 'Steam недоступен' : 'Мультиплеер: нет')
    if (S.role === 'host') txt = P.T('Хост · игроков: {n}', { n: S.peers.size + 1 })
    else if (S.role === 'client') {
      if (S.hostSilent) txt = P.T('Нет связи с хостом…')
      else {
        txt = P.T(S.welcomed ? 'В лобби · игроков: {n}' : 'Синхронизация… · игроков: {n}', { n: S.peers.size + 1 }) +
          (S.rtt != null ? P.T(' · пинг {ms} мс', { ms: Math.round(S.rtt) }) : '')
      }
    }
    UI.status('Net', txt)
    wrap.classList.toggle('online', S.isOnline() && !S.hostSilent)
    wrap.classList.toggle('warn', S.role === 'client' && S.hostSilent)
    const st = S.stats
    wrap.title = S.lobby
      ? P.T('Код лобби: {id}\nПереотправлено: {a} · докачано дыр: {b} · пересинхронизаций: {c}', { id: S.lobby.id, a: st.resends, b: st.needs, c: st.resyncs })
      : P.T(S.error || '')
  }

  // ------------------------------------------------------------ menus
  function styleIcon (style) {
    if (style === 'none') return null
    const b = { solid: 'brush', crayon: 'crayon', marker: 'marker', oil: 'oil', npencil: 'npencil', water: 'water' }[style]
    return UI.brushSample(b, 16, 16)
  }

  A.menus = {
    paste: () => [
      { label: 'Вставить', icon: 'paste', shortcut: 'Ctrl+V', action: () => A.cmd('paste') },
      { label: 'Вставить из', icon: 'pasteFrom', action: () => A.cmd('pasteFrom') }
    ],
    select: () => [
      { head: 'Формы выделения' },
      { label: 'Прямоугольная область', icon: 'selRect', radio: true, checked: A.selMode === 'rect', action: () => { A.selMode = 'rect'; A.setTool('select') } },
      { label: 'Произвольная область', icon: 'selFree', radio: true, checked: A.selMode === 'free', action: () => { A.selMode = 'free'; A.setTool('select') } },
      { head: 'Параметры выделения' },
      { label: 'Выделить все', icon: 'selAll', shortcut: 'Ctrl+A', action: () => A.cmd('selectAll') },
      { label: 'Обратить выделение', icon: 'selInv', action: () => A.cmd('invertSel') },
      { label: 'Удалить', icon: 'selDel', shortcut: 'Delete', disabled: !T.select.active(), action: () => A.cmd('deleteSel') },
      { label: 'Прозрачное выделение', icon: 'selTrans', checked: A.transparentSel, action: () => { A.transparentSel = !A.transparentSel; T.select.refresh() } },
      { head: 'Масштабирование' },
      { label: 'Режим масштабирования', icon: 'resize', sub: A.menus.resample }
    ],
    resample: () => R.RESAMPLE.map(m => ({
      label: R.RESAMPLE_NAMES[m], radio: true, checked: A.resample === m, action: () => A.setResample(m)
    })),
    rotate: () => [
      { label: 'Повернуть на 90° вправо', icon: 'rotR', action: () => A.rotate('r90') },
      { label: 'Повернуть на 90° влево', icon: 'rotL', action: () => A.rotate('l90') },
      { label: 'Повернуть на 180°', icon: 'rot180', action: () => A.rotate('180') },
      { label: 'Отразить по вертикали', icon: 'flipV', action: () => A.rotate('fv') },
      { label: 'Отразить по горизонтали', icon: 'flipH', action: () => A.rotate('fh') }
    ],
    brushes: () => R.BRUSHES.map(b => ({
      label: R.BRUSH_NAMES[b],
      iconURL: UI.brushSample(b, 16, 16),
      radio: true,
      checked: A.brush === b,
      action: () => { A.brush = b; A.setTool('brush'); A.updateToolUI() }
    })),
    outline: () => R.STYLES.map(s => ({
      label: s === 'none' ? 'Без контура' : R.STYLE_NAMES[s],
      iconURL: styleIcon(s),
      radio: true,
      checked: A.outline === s,
      action: () => { A.outline = s; T.shape.refresh() }
    })),
    fillstyle: () => R.STYLES.map(s => ({
      label: s === 'none' ? 'Без заливки' : R.STYLE_NAMES[s],
      iconURL: styleIcon(s),
      radio: true,
      checked: A.fill === s,
      action: () => { A.fill = s; T.shape.refresh() }
    })),
    size: () => {
      const k = A.sizeKey()
      if (!k) return null
      return R.SIZES[k].map(s => {
        const ic = UI.lineSample(k === 'brush' ? R.brushWidth(A.brush, s) : s)
        return {
          label: P.T('{n} пкс', { n: s }),
          iconURL: ic.url,
          iconScale: ic.scale,
          radio: true,
          checked: A.sizes[k] === s,
          action: () => { A.sizes[k] = s; T.refresh() }
        }
      })
    },
    lobbyType: () => [
      { label: 'Публичное лобби', icon: 'mpBrowse32', big: true, desc: 'Видно всем в «Найти лобби»', action: () => A.createLobby(2) },
      { label: 'Только для друзей', icon: 'mpCreate32', big: true, desc: 'Друзья могут зайти через список друзей Steam', action: () => A.createLobby(1) },
      { label: 'Приватное', icon: 'mpKey', big: true, desc: 'Только по приглашению или коду', action: () => A.createLobby(0) }
    ],
    qat: () => [
      { head: 'Настройка панели быстрого доступа' },
      { label: 'Создать', action: () => A.cmd('new') },
      { label: 'Открыть', action: () => A.cmd('open') },
      { label: 'Сохранить', checked: true, action: () => A.cmd('save') },
      { label: 'Отменить', checked: true, action: () => A.cmd('undo') },
      { label: 'Вернуть', checked: true, action: () => A.cmd('redo') },
      { sep: true },
      { label: 'Свернуть ленту', checked: $('#ribbon').classList.contains('collapsed'), action: () => UI.toggleRibbon() }
    ]
  }

  A.selectionMenu = function (x, y) {
    const has = T.select.active()
    UI.contextMenu(x, y, [
      { label: 'Вырезать', icon: 'cut', shortcut: 'Ctrl+X', disabled: !has, action: () => A.cmd('cut') },
      { label: 'Копировать', icon: 'copy', shortcut: 'Ctrl+C', disabled: !has, action: () => A.cmd('copy') },
      { label: 'Вставить', icon: 'paste', shortcut: 'Ctrl+V', action: () => A.cmd('paste') },
      { sep: true },
      { label: 'Выделить все', icon: 'selAll', shortcut: 'Ctrl+A', action: () => A.cmd('selectAll') },
      { label: 'Обратить выделение', icon: 'selInv', action: () => A.cmd('invertSel') },
      { label: 'Удалить', icon: 'selDel', shortcut: 'Delete', disabled: !has, action: () => A.cmd('deleteSel') },
      { sep: true },
      { label: 'Обрезать', icon: 'crop', shortcut: 'Ctrl+Shift+X', disabled: !has, action: () => A.cmd('crop') },
      { label: 'Повернуть', icon: 'rotate', sub: A.menus.rotate() },
      { label: 'Изменить размер', icon: 'resize', shortcut: 'Ctrl+W', action: () => A.cmd('resize') },
      { label: 'Режим масштабирования', sub: A.menus.resample() },
      { label: 'Обратить цвет', shortcut: 'Ctrl+Shift+I', action: () => A.cmd('invertColors') }
    ])
  }

  // ------------------------------------------------------------ commands
  A.cmd = async function (name) {
    switch (name) {
      case 'new': return A.newImage()
      case 'open': return A.openImage()
      case 'save': return A.save()
      case 'saveAs': return A.saveAs(null)
      case 'exit': return A.exit()
      case 'properties': return A.properties()
      case 'undo': return A.undo()
      case 'redo': S.redo(); A.updateCommands(); return
      case 'cut': return A.copy(true)
      case 'copy': return A.copy(false)
      case 'paste': return A.paste()
      case 'pasteFrom': return A.pasteFrom()
      case 'selectAll': A.setTool('select'); T.select.selectAll(); return
      case 'invertSel': A.setTool('select'); T.select.invertSel(); return
      case 'deleteSel': T.select.deleteSel(); return
      case 'crop': return A.crop()
      case 'resize': return A.resize()
      case 'invertColors':
        if (!T.select.invertColors()) { T.commitAll(); S.submit({ t: 'invert' }) }
        return
      case 'zoomIn': return V.zoomStep(1)
      case 'zoomOut': return V.zoomStep(-1)
      case 'zoom100': return V.setZoom(1)
      case 'fullscreen': return A.fullscreen(true)
      case 'thumbnail': return A.thumbnail(!A.thumbOn)
      case 'editColors': return A.editColors()
      case 'mpCreate': return A.createLobby(2)
      case 'mpInvite': return A.inviteFriends()
      case 'mpBrowse': return A.browseLobbies()
      case 'mpJoinCode': return A.joinByCode()
      case 'mpCopyCode': if (S.lobby) { A.copyText(S.lobby.id) } return
      case 'mpLeave': return A.leaveLobby()
      case 'langRu': return A.setLang('ru')
      case 'langEn': return A.setLang('en')
      case 'mpLog':
        if (native && native.openLog) native.openLog()
        else Dl.alert('Журнал сети есть только в приложении (Paint.exe).', 'info')
        return
    }
  }

  // Switch the UI language on the fly: static text is re-translated from the
  // remembered originals, dynamic parts are simply rendered again.
  A.setLang = function (l) {
    P.i18n.setLang(l)
    for (const id of ['#btnBold', '#btnItalic', '#btnUnderline']) { const el = $(id); el.innerHTML = P.icons[el.dataset.icon] }
    UI.renderPalette()
    A.updateToolUI()
    A.updateTextUI()
    updateSteamUI()
    A.updateTitle()
    A.updateStatus()
    A.updateLangUI()
  }
  A.updateLangUI = function () {
    const l = P.i18n.lang()
    $('#langRu').classList.toggle('on', l === 'ru')
    $('#langEn').classList.toggle('on', l === 'en')
    if (native && native.setLang) native.setLang(l)
  }

  A.undo = function () {
    if (T.cancelTransient()) { A.updateCommands(); return }
    const t = T.cur()
    if (t.busy && t.busy()) return
    S.undo()
    A.updateCommands()
  }

  A.rotate = function (k) {
    if (T.select.active()) { T.select.xform(k); return }
    T.commitAll()
    S.submit({ t: 'xform', k })
  }

  A.crop = function () {
    if (!T.select.active()) return
    const op = T.select.cropOp()
    if (op) S.submit(op)
    A.updateCommands()
  }

  A.resize = async function () {
    const sz = T.select.active() ? T.select.size() : { w: D.width(), h: D.height() }
    if (!T.select.active()) T.commitAll()
    const r = await Dl.resize(sz.w, sz.h, A.resample)
    if (!r) return
    A.setResample(r.rs)
    if (T.select.active()) T.select.scale(r)
    else S.submit({ t: 'scale', w: r.w, h: r.h, ax: r.ax, ay: r.ay, rs: r.rs, c: A.color2.slice() })
  }

  A.properties = async function () {
    T.commitAll()
    const r = await Dl.properties({
      w: D.width(), h: D.height(),
      saved: A.file.saved ? A.file.saved.toLocaleString(P.i18n.lang() === 'en' ? 'en-US' : 'ru-RU') : null,
      size: A.file.size != null ? U.fmtSize(A.file.size) : null
    })
    if (r && (r.w !== D.width() || r.h !== D.height())) S.submit({ t: 'canvas', w: r.w, h: r.h, c: [255, 255, 255] })
  }

  // the standard Windows color dialog in Paint.exe; ours in the browser build
  A.editColors = async function () {
    const cur = A.slot === 1 ? A.color1 : A.color2
    let c
    const r = native && native.chooseColor ? await native.chooseColor(cur, A.dlgCustom) : { unavailable: true }
    if (r.unavailable) c = await Dl.editColors(cur, A.dlgCustom)
    else {
      A.dlgCustom = r.custom.map(x => (x[0] === 255 && x[1] === 255 && x[2] === 255 ? null : x))
      try { localStorage.setItem('mp-paint-custom', JSON.stringify(A.dlgCustom)) } catch (e) {}
      c = r.color
    }
    if (!c) return
    A.setColor(A.slot, c)
    if (!A.custom.some(x => x && U.eq(x, c))) {
      A.custom[A.customNext] = c
      A.customNext = (A.customNext + 1) % 10
      UI.renderPalette()
    }
  }

  // ------------------------------------------------------------ clipboard
  A.copyText = function (text) {
    try { navigator.clipboard.writeText(text) } catch (e) {}
  }

  A.copy = async function (cut) {
    if (T.text.active()) { document.execCommand(cut ? 'cut' : 'copy'); return }
    const img = T.select.image()
    if (!img) return
    const url = img.toDataURL('image/png')
    try {
      if (native) await native.writeClipboardImage(url)
      else {
        const blob = await (await fetch(url)).blob()
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      }
    } catch (e) { console.warn('clipboard write failed', e) }
    if (cut) T.select.deleteSel()
    A.updateCommands()
  }

  A.paste = async function () {
    if (T.text.active()) { T.text.focus(); document.execCommand('paste'); return }
    let url = null
    try {
      if (native) url = await native.readClipboardImage()
      else {
        const items = await navigator.clipboard.read()
        for (const it of items) {
          const type = it.types.find(t => t.startsWith('image/'))
          if (type) { url = URL.createObjectURL(await it.getType(type)); break }
        }
      }
    } catch (e) { console.warn('clipboard read failed', e) }
    if (!url) return
    try { A.pasteImage(await U.loadImage(url)) } catch (e) { Dl.alert('Не удалось вставить изображение.', 'error') }
  }

  A.pasteFrom = async function () {
    const r = await pickFile()
    if (!r) return
    try { A.pasteImage(await U.loadImage(r.dataURL)) } catch (e) { Dl.alert('Paint не удается прочитать этот файл.\nЭто недопустимый точечный рисунок, или его формат не поддерживается.', 'error') }
  }

  // at: image point for the top-left corner (drag & drop), else the view's corner
  A.pasteImage = async function (img, at) {
    T.commitAll()
    if (img.width > D.width() || img.height > D.height()) {
      const r = await Dl.message({ title: 'Paint', icon: 'question', text: 'Вставляемое изображение больше холста.\nУвеличить холст, чтобы изображение поместилось?', buttons: ['Да', 'Нет', 'Отмена'] })
      if (r === 2 || r === -1) return
      if (r === 0) {
        S.submit({ t: 'canvas', w: Math.max(img.width, D.width()), h: Math.max(img.height, D.height()), c: A.color2.slice() })
        at = null
      }
    }
    if (at) {
      at = { x: U.clamp(at.x, 0, Math.max(0, D.width() - img.width)), y: U.clamp(at.y, 0, Math.max(0, D.height() - img.height)) }
    }
    A.setTool('select')
    T.select.paste(img, at)
    A.updateCommands()
  }

  const readAsDataURL = file => new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result)
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(file)
  })
  const IMG_NAME = /\.(png|jpe?g|jpe|jfif|bmp|dib|gif|ico|webp|avif|svg)$/i

  // Pictures dragged in from Explorer or a browser are pasted where they are
  // dropped, as a selection (in a lobby, everyone sees them).
  A.dropData = async function (dt, clientX, clientY) {
    if (Dl.isOpen()) return
    let url = null
    const file = Array.from(dt.files || []).find(f => f.type.startsWith('image/') || IMG_NAME.test(f.name))
    try {
      if (file) url = await readAsDataURL(file)
      else {
        const html = dt.getData('text/html') || ''
        const m = html.match(/<img[^>]+src\s*=\s*["']([^"']+)["']/i)
        const link = (m && m[1].replace(/&amp;/g, '&')) || (dt.getData('text/uri-list') || '').split(/\r?\n/).find(l => l && l[0] !== '#') || ''
        if (/^data:image\//i.test(link)) url = link
        else if (/^https?:\/\//i.test(link) && native && native.fetchImage) url = await native.fetchImage(link)
      }
    } catch (e) { url = null }
    if (!url) {
      if (file || (dt.files && dt.files.length) || dt.types.includes('text/uri-list')) Dl.alert('Paint не удается прочитать этот файл.\nЭто недопустимый точечный рисунок, или его формат не поддерживается.', 'error')
      return
    }
    let img
    try { img = await U.loadImage(url) } catch (e) {
      Dl.alert('Paint не удается прочитать этот файл.\nЭто недопустимый точечный рисунок, или его формат не поддерживается.', 'error')
      return
    }
    const pt = V.clientToImage(clientX, clientY)
    A.pasteImage(img, { x: pt.x, y: pt.y })
  }

  // ------------------------------------------------------------ files
  function pickFile () {
    if (native) {
      return native.openFile().then(r => {
        if (r && r.error) { Dl.alert(r.error, 'error'); return null }
        return r
      })
    }
    return new Promise(resolve => {
      const inp = h('input', { type: 'file', accept: 'image/*' })
      inp.addEventListener('change', () => {
        const f = inp.files[0]
        if (!f) return resolve(null)
        const fr = new FileReader()
        fr.onload = () => resolve({ name: f.name, size: f.size, dataURL: fr.result, path: null })
        fr.readAsDataURL(f)
      })
      inp.click()
    })
  }

  A.confirmDiscard = async function () {
    if (!A.dirty) return true
    const name = A.file.name || P.T('Безымянный')
    const r = await Dl.message({
      title: 'Paint', icon: 'warn', main: P.T('Сохранить изменения в «{name}»?', { name }), buttons: ['Сохранить', 'Не сохранять', 'Отмена']
    })
    if (r === 0) return await A.save()
    return r === 1
  }

  A.newImage = async function () {
    if (!(await A.confirmDiscard())) return
    if (S.isOnline()) {
      const r = await Dl.message({ title: 'Paint', icon: 'question', text: 'Холст будет очищен у всех участников лобби. Продолжить?', buttons: ['Да', 'Нет'] })
      if (r !== 0) return
    }
    T.commitAll()
    T.select.cancel()
    S.submit({ t: 'load', w: 1152, h: 648 })
    A.file = { name: null, path: null, size: null, saved: null }
    A.dirty = false
    A.updateTitle(); A.updateStatus()
  }

  A.openImage = async function () {
    if (!(await A.confirmDiscard())) return
    const r = await pickFile()
    if (r) await A.loadFile(r)
  }

  A.openRecent = async function (p) {
    if (!(await A.confirmDiscard())) return
    const r = await native.readFile(p)
    if (!r || r.error) { Dl.alert('Не удается открыть файл:\n' + p, 'error'); A.removeRecent(p); return }
    await A.loadFile(r)
  }

  A.loadFile = async function (r) {
    let img
    try { img = await U.loadImage(r.dataURL) } catch (e) {
      Dl.alert('Paint не удается прочитать этот файл.\nЭто недопустимый точечный рисунок, или его формат не поддерживается.', 'error')
      return
    }
    if (S.isOnline()) {
      const q = await Dl.message({ title: 'Paint', icon: 'question', text: P.T('Изображение «{name}» заменит холст у всех участников лобби. Продолжить?', { name: r.name }), buttons: ['Да', 'Нет'] })
      if (q !== 0) return
    }
    T.commitAll()
    T.select.cancel()
    const c = U.canvas(img.width, img.height)
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(img, 0, 0)
    S.submit({ t: 'load', w: c.width, h: c.height, img: c.toDataURL('image/png') })
    A.file = { name: r.name, path: r.path || null, size: r.size, saved: r.mtime ? new Date(r.mtime) : null }
    A.dirty = false
    if (r.path) A.addRecent(r.path)
    A.updateTitle(); A.updateStatus()
  }

  async function encode (fmt) {
    const c = D.exportCanvas()
    if (fmt === 'bmp') return U.encodeBMP(c)
    if (fmt === 'jpg') return U.canvasToBlobBytes(c, 'image/jpeg', 0.92)
    return U.canvasToBlobBytes(c, 'image/png')
  }
  const extFmt = p => {
    const e = (p.split('.').pop() || '').toLowerCase()
    if (['jpg', 'jpeg', 'jpe', 'jfif'].includes(e)) return 'jpg'
    if (['bmp', 'dib'].includes(e)) return 'bmp'
    return 'png'
  }

  A.save = async function () {
    if (!A.file.path || !native) return A.saveAs(null)
    return writeTo(A.file.path)
  }

  A.saveAs = async function (fmt) {
    T.commitAll()
    await S.whenIdle()
    const base = (A.file.name || P.T('Безымянный')).replace(/\.[^.]+$/, '')
    fmt = fmt || (A.file.name ? extFmt(A.file.name) : 'png')
    if (native) {
      const p = await native.pickSavePath({ defaultName: base + '.' + fmt, format: fmt })
      if (!p) return false
      return writeTo(p)
    }
    const bytes = await encode(fmt)
    const blob = new Blob([bytes], { type: fmt === 'jpg' ? 'image/jpeg' : fmt === 'bmp' ? 'image/bmp' : 'image/png' })
    const a = h('a', { href: URL.createObjectURL(blob), download: base + '.' + fmt })
    a.click()
    A.file.name = base + '.' + fmt; A.file.size = bytes.length; A.file.saved = new Date()
    A.dirty = false
    A.updateTitle(); A.updateStatus()
    return true
  }

  async function writeTo (p) {
    T.commitAll()
    await S.whenIdle()
    const bytes = await encode(extFmt(p))
    const r = await native.writeFile(p, bytes)
    if (!r || r.error) { Dl.alert('Не удается сохранить файл:\n' + ((r && r.error) || p), 'error'); return false }
    A.file = { name: r.name, path: r.path, size: r.size, saved: new Date(r.mtime) }
    A.dirty = false
    A.addRecent(r.path)
    A.updateTitle(); A.updateStatus()
    return true
  }

  A.recentFiles = function () {
    try { return JSON.parse(localStorage.getItem('mp-paint-recent') || '[]') } catch (e) { return [] }
  }
  A.addRecent = function (p) {
    if (!native) return
    const list = A.recentFiles().filter(x => x !== p)
    list.unshift(p)
    try { localStorage.setItem('mp-paint-recent', JSON.stringify(list.slice(0, 9))) } catch (e) {}
  }
  A.removeRecent = function (p) {
    try { localStorage.setItem('mp-paint-recent', JSON.stringify(A.recentFiles().filter(x => x !== p))) } catch (e) {}
  }

  A.exit = async function () {
    if (!(await A.confirmDiscard())) return
    S.leave()
    if (native) native.quit(); else window.close()
  }

  // ------------------------------------------------------------ view modes
  A.fullscreen = function (on) {
    const fv = $('#fullscreenView')
    if (on) {
      T.commitAll()
      const c = fv.querySelector('canvas')
      c.width = D.width(); c.height = D.height()
      c.getContext('2d').drawImage(D.canvas, 0, 0)
      fv.classList.remove('hidden')
      if (native) native.setFullScreen(true); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {})
      A.fsOn = true
    } else {
      fv.classList.add('hidden')
      if (native) native.setFullScreen(false); else if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
      A.fsOn = false
    }
  }

  let thumbTimer = 0
  A.thumbnail = function (on) {
    A.thumbOn = on
    $('#thumbWin').classList.toggle('hidden', !on)
    $('#thumbBtn').classList.toggle('on', on)
    if (on) drawThumb()
  }
  function drawThumb () {
    thumbTimer = 0
    if (!A.thumbOn) return
    const c = $('#thumbWin canvas')
    const k = Math.min(240 / D.width(), 180 / D.height(), 1)
    c.width = Math.max(1, Math.round(D.width() * k)); c.height = Math.max(1, Math.round(D.height() * k))
    const ctx = c.getContext('2d')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(D.canvas, 0, 0, c.width, c.height)
    ctx.drawImage(V.pendingCv, 0, 0, c.width, c.height)
  }
  const thumbSoon = () => { if (A.thumbOn && !thumbTimer) thumbTimer = setTimeout(drawThumb, 200) }

  // ------------------------------------------------------------ multiplayer UI
  function showConnect (text) {
    $('#connectText').textContent = P.T(text)
    $('#connectOverlay').classList.remove('hidden')
  }
  function hideConnect () { $('#connectOverlay').classList.add('hidden') }

  A.createLobby = async function (type) {
    if (!S.available) { Dl.alert(S.error || 'Мультиплеер недоступен.', 'error'); return }
    T.commitAll()
    const r = await S.createLobby(type, 8)
    if (!r.ok) { Dl.alert(r.error || 'Не удалось создать лобби.', 'error'); return }
    A.updateCommands(); A.updateStatus()
    UI.showTab('mp')
    Dl.lobbyCreated(S.lobby.id)
  }

  A.joinLobby = async function (id) {
    if (!S.available) { Dl.alert(S.error || 'Мультиплеер недоступен.', 'error'); return }
    if (S.lobby && S.lobby.id === String(id)) return
    if (S.isOnline()) {
      const q = await Dl.message({ title: 'Paint', icon: 'question', text: 'Вы уже в лобби. Выйти из него и подключиться к другому?', buttons: ['Да', 'Нет'] })
      if (q !== 0) return
      S.leave()
    } else if (A.dirty) {
      const q = await Dl.message({ title: 'Paint', icon: 'warn', text: 'Ваш текущий рисунок будет заменён холстом хоста.\nСохранить его перед подключением?', buttons: ['Сохранить', 'Не сохранять', 'Отмена'] })
      if (q === 2 || q === -1) return
      if (q === 0 && !(await A.save())) return
    }
    T.commitAll()
    T.select.cancel()
    showConnect('Подключение к лобби…')
    const r = await S.joinLobby(id)
    if (!r.ok) { hideConnect(); Dl.alert(r.error || 'Не удалось подключиться.', 'error'); return }
    showConnect('Загрузка холста хоста…')
    A.updateCommands(); A.updateStatus()
    UI.showTab('mp')
  }

  A.inviteFriends = function () {
    if (!S.isOnline()) return
    if (S.transport && S.transport.kind === 'steam') Dl.inviteFriends()
  }

  A.browseLobbies = async function () {
    const id = await Dl.lobbyBrowser()
    if (id) A.joinLobby(id)
  }

  A.joinByCode = async function () {
    const code = await Dl.prompt('Войти по коду', 'Введите код лобби (его можно скопировать у хоста на вкладке «Мультиплеер»):', '')
    if (code && code.trim()) A.joinLobby(code.trim())
  }

  A.leaveLobby = async function () {
    if (!S.isOnline()) return
    const q = await Dl.message({ title: 'Paint', icon: 'question', text: 'Покинуть лобби? Текущий рисунок останется у вас.', buttons: ['Да', 'Нет'] })
    if (q !== 0) return
    S.leave()
    A.updateCommands(); A.updateStatus()
  }

  function renderPlayers () {
    const box = $('#playerList')
    box.innerHTML = ''
    if (!S.isOnline()) {
      box.appendChild(h('div.player-empty', { text: S.available ? 'Создайте лобби или подключитесь к другу.' : (S.error || 'Мультиплеер недоступен') }))
      return
    }
    const row = (name, color, avatar, tag, ping) => h('div.player', null,
      h('span.dot', { style: { background: color } }),
      h('span.pav', { style: avatar ? { backgroundImage: 'url("' + avatar + '")' } : null }),
      h('span.pname', { text: name }), tag ? h('span.tag', { text: tag }) : null,
      ping ? h('span.ping', { text: ping }) : null)
    const ownerId = S.lobby && S.lobby.owner
    box.appendChild(row(S.myName, S.myColor || '#0078d7', S.myAvatar, ownerId === S.me ? '(вы, хост)' : '(вы)'))
    const now = Date.now()
    for (const p of S.peers.values()) {
      const ping = now - p.lastSeen > 6000 ? 'нет связи' : p.rtt != null ? P.T('{ms} мс', { ms: Math.round(p.rtt) }) : ''
      box.appendChild(row(p.name, p.color, p.avatar, p.id === ownerId ? '(хост)' : '', ping))
    }
  }

  function updateSteamUI () {
    const nameEl = $('#steamName'); const stEl = $('#steamState')
    if (S.available) {
      nameEl.textContent = S.transport.kind === 'steam' ? 'Steam: ' + S.myName : P.T('Тест (вкладки): {name}', { name: S.myName })
      $('#myAvatar').style.backgroundImage = S.myAvatar ? 'url("' + S.myAvatar + '")' : ''
    } else {
      nameEl.textContent = P.T('Steam: не подключен')
    }
    const n = S.peers.size + 1
    let st = P.T('Не в лобби')
    if (!S.available) st = P.T(S.error || 'Мультиплеер недоступен')
    else if (S.role === 'host') st = P.T('Хост лобби · {n} игр.', { n })
    else if (S.role === 'client') st = P.T(S.welcomed ? 'В лобби · {n} игр.' : 'Подключение · {n} игр.', { n })
    stEl.textContent = st
    stEl.title = S.lobby ? P.T('Код лобби: {id}', { id: S.lobby.id }) : st
    renderPlayers()
    A.updateCommands()
    A.updateStatus()
  }

  // ------------------------------------------------------------ text tab controls
  async function initTextControls () {
    let fonts = FONTS
    try {
      if (window.queryLocalFonts) {
        const list = await window.queryLocalFonts()
        const fams = Array.from(new Set(list.map(f => f.family))).sort((a, b) => a.localeCompare(b))
        if (fams.length) fams.length > 5 && (fonts = fams)
      }
    } catch (e) {}
    const ff = $('#fontFamily'); const fs = $('#fontSize')
    const applyFont = () => { const v = ff.value.trim(); if (v) { A.text.font = v; T.text.refresh() } }
    const applySize = () => { const v = parseFloat(fs.value.replace(',', '.')); if (v > 0 && v <= 999) { A.text.size = v; T.text.refresh() } }
    ff.addEventListener('change', applyFont)
    ff.addEventListener('keydown', e => { if (e.key === 'Enter') { applyFont(); T.text.focus() } e.stopPropagation() })
    fs.addEventListener('change', applySize)
    fs.addEventListener('keydown', e => { if (e.key === 'Enter') { applySize(); T.text.focus() } e.stopPropagation() })
    $('#fontCombo .combo-btn').addEventListener('click', e => {
      e.stopPropagation()
      if (UI.nativeMenus) {
        UI.dropdown($('#fontCombo'), fonts.map(f => ({ label: f, radio: true, checked: f === A.text.font, action: () => { A.text.font = f; A.updateTextUI(); T.text.refresh(); T.text.focus() } })))
        return
      }
      const box = h('div', { style: { maxHeight: '360px', overflowY: 'auto', width: '230px' } })
      for (const f of fonts) {
        const it = h('div.mi' + (f === A.text.font ? '.checked' : ''), null, h('span.mic'), h('span', { text: f, style: { fontFamily: '"' + f + '"', fontSize: '14px' } }))
        it.addEventListener('click', () => { UI.closeMenus(); A.text.font = f; A.updateTextUI(); T.text.refresh(); T.text.focus() })
        box.appendChild(it)
      }
      UI.dropdown($('#fontCombo'), [{ el: box }])
      const cur = box.querySelector('.checked'); if (cur) cur.scrollIntoView({ block: 'center' })
    })
    $('#sizeCombo .combo-btn').addEventListener('click', e => {
      UI.dropdown($('#sizeCombo'), FONT_SIZES.map(s => ({ label: String(s), radio: true, checked: s === A.text.size, action: () => { A.text.size = s; A.updateTextUI(); T.text.refresh(); T.text.focus() } })))
      e.stopPropagation()
    })
    $('#btnBold').addEventListener('click', () => A.toggleText('b'))
    $('#btnItalic').addEventListener('click', () => A.toggleText('i'))
    $('#btnUnderline').addEventListener('click', () => A.toggleText('u'))
    $('#btnStrike').addEventListener('click', () => A.toggleText('s'))
    $('#btnOpaque').addEventListener('click', () => { A.text.opaque = true; A.updateTextUI(); T.text.refresh(); T.text.focus() })
    $('#btnTransparent').addEventListener('click', () => { A.text.opaque = false; A.updateTextUI(); T.text.refresh(); T.text.focus() })
    // keep focus in the text box when clicking ribbon buttons of the text tab
    for (const b of U.$$('[data-panel="text"] button')) b.addEventListener('mousedown', e => e.preventDefault())
    A.updateTextUI()
  }

  // ------------------------------------------------------------ keyboard
  function onKey (e) {
    if (Dl.isOpen()) return
    const tag = e.target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    if (A.fsOn) { A.fullscreen(false); e.preventDefault(); return }
    const ctrl = e.ctrlKey || e.metaKey
    if (e.key === 'Escape' && UI.menuOpen()) { UI.closeMenus(); return }
    const tool = T.cur()
    if (!ctrl && !e.altKey && tool.key && tool.key(e)) { e.preventDefault(); return }
    let handled = true
    if (ctrl) {
      switch (e.code) {
        case 'KeyN': A.cmd('new'); break
        case 'KeyO': A.cmd('open'); break
        case 'KeyS': A.cmd('save'); break
        case 'KeyZ': if (e.shiftKey) A.cmd('redo'); else A.cmd('undo'); break
        case 'KeyY': A.cmd('redo'); break
        case 'KeyA': A.cmd('selectAll'); break
        case 'KeyC': A.cmd('copy'); break
        case 'KeyX': if (e.shiftKey) A.cmd('crop'); else A.cmd('cut'); break
        case 'KeyV': A.cmd('paste'); break
        case 'KeyE': A.cmd('properties'); break
        case 'KeyW': A.cmd('resize'); break
        case 'KeyR': $('#chkRulers').click(); break
        case 'KeyG': $('#chkGrid').click(); break
        case 'KeyI': if (e.shiftKey) A.cmd('invertColors'); else handled = false; break
        case 'PageUp': A.cmd('zoomIn'); break
        case 'PageDown': A.cmd('zoomOut'); break
        case 'NumpadAdd': case 'Equal': A.changeSize(1); break
        case 'NumpadSubtract': case 'Minus': A.changeSize(-1); break
        case 'F1': UI.toggleRibbon(); break
        default: handled = false
      }
    } else {
      switch (e.key) {
        case 'F11': A.cmd('fullscreen'); break
        case 'F12': A.cmd('saveAs'); break
        case 'Delete': T.select.deleteSel(); break
        default: handled = false
      }
    }
    if (handled) e.preventDefault()
  }

  // ------------------------------------------------------------ boot
  A.init = async function () {
    R.initTextures()
    try {
      const rs = localStorage.getItem('mp-paint-resample')
      if (R.RESAMPLE.includes(rs)) A.resample = rs
      const cc = JSON.parse(localStorage.getItem('mp-paint-custom') || 'null')
      if (Array.isArray(cc) && cc.length === 16) A.dlgCustom = cc
    } catch (e) {}
    D.init($('#cvMain'))
    V.init()
    UI.injectIcons(document)
    P.i18n.translateDOM(document.body)
    A.updateLangUI()
    UI.initRibbon()
    UI.initGallery()
    UI.renderPalette()
    UI.updateColors()
    UI.initZoomSlider()
    T.init()
    A.updateToolUI()
    T.setCursorFor()

    // ribbon bindings
    document.addEventListener('click', e => {
      const t = e.target.closest('[data-cmd],[data-tool],[data-menu],[data-slot]')
      if (!t || t.classList.contains('disabled')) return
      if (t.dataset.menu) { e.stopPropagation(); const items = A.menus[t.dataset.menu] && A.menus[t.dataset.menu](); if (items) UI.dropdown(t, items); return }
      if (t.dataset.tool) { A.setTool(t.dataset.tool); return }
      if (t.dataset.slot) { A.slot = Number(t.dataset.slot); UI.updateColors(); return }
      if (t.dataset.cmd) A.cmd(t.dataset.cmd)
    })
    $('#fileTab').addEventListener('click', e => { e.stopPropagation(); UI.openFileMenu() })
    $('#chkRulers').addEventListener('change', e => V.setRulers(e.target.checked))
    $('#chkGrid').addEventListener('change', e => { V.grid = e.target.checked; V.updateGrid() })
    $('#chkStatus').addEventListener('change', e => $('#statusbar').classList.toggle('hidden', !e.target.checked))
    $('#chkCursors').addEventListener('change', e => { S.showCursors = e.target.checked; V.refreshCursors() })
    $('#chkNames').addEventListener('change', e => { S.showNames = e.target.checked; V.refreshCursors() })
    $('#chkLive').addEventListener('change', e => { S.liveEnabled = e.target.checked; for (const p of S.peers.values()) S.emit('live', p, true) })
    $('#fullscreenView').addEventListener('click', () => A.fullscreen(false))
    $('#thumbWin .x').addEventListener('click', () => A.thumbnail(false))
    const tt = $('#thumbWin .thumb-title')
    tt.addEventListener('pointerdown', e => {
      if (e.target.closest('.x')) return
      tt.setPointerCapture(e.pointerId)
      const r = $('#thumbWin').getBoundingClientRect(); const ox = e.clientX - r.left; const oy = e.clientY - r.top
      const mv = ev => { const w = $('#thumbWin'); w.style.left = (ev.clientX - ox) + 'px'; w.style.top = (ev.clientY - oy) + 'px'; w.style.right = 'auto' }
      const up = () => { tt.removeEventListener('pointermove', mv); tt.removeEventListener('pointerup', up) }
      tt.addEventListener('pointermove', mv); tt.addEventListener('pointerup', up)
    })
    $('#connectCancel').addEventListener('click', () => { S.leave(); hideConnect() })
    document.addEventListener('keydown', onKey)
    document.addEventListener('contextmenu', e => { if (!e.target.closest('textarea, input')) e.preventDefault() })
    // drag & drop of pictures; our own images must not be dragged around
    document.addEventListener('dragstart', e => { if (e.target.tagName === 'IMG') e.preventDefault() })
    window.addEventListener('dragover', e => {
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = Dl.isOpen() ? 'none' : 'copy'
    })
    window.addEventListener('drop', e => {
      e.preventDefault()
      if (e.dataTransfer) A.dropData(e.dataTransfer, e.clientX, e.clientY)
    })
    window.addEventListener('paste', e => {
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' || native) return
      const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'))
      if (item) { e.preventDefault(); U.loadImage(URL.createObjectURL(item.getAsFile())).then(A.pasteImage) }
    })
    V.on('ghost', (w, hh) => UI.status('Size', P.T('{w} × {h}пкс', w ? { w, h: hh } : { w: D.width(), h: D.height() })))

    D.on('change', () => { A.updateStatus(); thumbSoon() })
    S.on('commit', op => {
      if (op && op.t !== 'load') A.dirty = true
      A.updateCommands()
      thumbSoon()
    })
    S.on('pending', () => { A.updateCommands(); thumbSoon() })
    for (const ev of ['status', 'lobby', 'peers', 'role']) S.on(ev, updateSteamUI)
    S.on('net', () => { renderPlayers(); A.updateStatus() })
    S.on('welcomed', () => { hideConnect(); updateSteamUI() })
    S.on('left', () => { hideConnect(); updateSteamUI() })
    S.on('error', msg => { hideConnect(); Dl.alert(msg, 'error') })
    S.on('progress', (from, got, total) => {
      if (!$('#connectOverlay').classList.contains('hidden') && total > 1) $('#connectText').textContent = P.T('Загрузка холста хоста… {p}%', { p: Math.round(got / total * 100) })
    })
    S.on('joinRequest', id => A.joinLobby(id))
    S.on('warn', kind => {
      if (kind !== 'steam' && kind !== 'steal') return
      Dl.message({
        title: 'Paint',
        icon: 'warn',
        text: 'Сетевые пакеты Paint перехватывает другая программа на этом компьютере.\n\n' +
          'Скорее всего, запущена игра на Steam AppID 480 (Spacewar или другая тестовая игра). ' +
          'Закройте её — иначе рисунки будут доходить с задержками и потерями.'
      })
    })

    initTextControls()
    A.updateTitle()
    A.updateStatus()
    UI.showTab('home')

    if (native) {
      native.onCloseRequest(async () => {
        if (Dl.isOpen()) return
        if (await A.confirmDiscard()) { S.leave(); native.quit() }
      })
      native.onFullScreen(on => { if (!on && A.fsOn) A.fullscreen(false) })
      try { A.version = await native.version() } catch (e) {}
    }

    await S.init()
    updateSteamUI()
    if (native) {
      const args = await native.args()
      if (args && args.connectLobby) A.joinLobby(args.connectLobby)
    }
    if (!S.available && native) console.warn('Steam unavailable:', S.error)
  }

  window.addEventListener('DOMContentLoaded', () => { A.init().catch(e => { console.error(e); Dl.alert('Ошибка запуска: ' + e.message, 'error') }) })
})(window.P)
