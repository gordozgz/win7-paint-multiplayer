'use strict'
const { app, BrowserWindow, ipcMain, dialog, clipboard, nativeImage, shell, Menu, net } = require('electron')
const path = require('path')
const fs = require('fs')
// Dev/test runs can use their own profile (and so their own instance lock).
if (process.env.PAINT_USER_DATA) app.setPath('userData', process.env.PAINT_USER_DATA)

// Only one Paint per PC. Steam's P2P queue belongs to the account, not the
// window: a second copy reads (and throws away) packets meant for the first.
if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

const steam = require('./steam')
const win32 = require('./win32')

steam.enableOverlay()

let win = null
let allowClose = false

// ---- network log: <userData>/logs/net.log (kept under ~2 MB)
const logDir = path.join(app.getPath('userData'), 'logs')
const logFile = path.join(logDir, 'net.log')
let logBuf = []
let logTimer = null
function writeLog (line) {
  logBuf.push(new Date().toISOString() + ' ' + line + '\n')
  if (process.env.PAINT_CONSOLE) process.stdout.write('[log] ' + line + '\n')
  if (logTimer) return
  logTimer = setTimeout(() => {
    logTimer = null
    const chunk = logBuf.join('')
    logBuf = []
    fs.mkdir(logDir, { recursive: true }, () => {
      fs.stat(logFile, (err, st) => {
        const rotate = !err && st.size > 2 * 1024 * 1024
        const append = () => fs.appendFile(logFile, chunk, () => {})
        if (rotate) fs.rename(logFile, path.join(logDir, 'net.old.log'), append); else append()
      })
    })
  }, 500)
}
const log = (...a) => writeLog(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '))
steam.setLogger((...a) => log('[steam]', ...a))
log('---- start', app.getVersion(), process.versions.electron, process.platform, require('os').release(), 'pid', process.pid)

// The main process is the browser process: if it stalls, window input is lost.
let lastTick = Date.now()
setInterval(() => {
  const now = Date.now()
  if (now - lastTick > 250) log('[main] event loop stalled', now - lastTick - 100, 'ms')
  lastTick = now
}, 100)

function parseArgs (argv) {
  const i = argv.indexOf('+connect_lobby')
  return { connectLobby: i >= 0 ? (argv[i + 1] || null) : null }
}
const startArgs = parseArgs(process.argv)

// Paint launched again (double click, or Steam passing +connect_lobby):
// bring the running window forward instead of starting a second copy.
app.on('second-instance', (e, argv) => {
  log('second launch blocked, focusing the running window')
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  const args = parseArgs(argv)
  if (args.connectLobby) win.webContents.send('steam:joinRequest', args.connectLobby)
})

// strings of the native file dialogs; the renderer reports its UI language
let uiLang = 'ru'
const EN = {
  'Открыть': 'Open',
  'Все файлы изображений': 'All Picture Files',
  'Все файлы': 'All Files',
  '24-разрядный рисунок': '24-bit Bitmap',
  'Сохранить как': 'Save As',
  'Безымянный': 'Untitled'
}
const L = s => (uiLang === 'en' && EN[s]) || s

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.jpe': 'image/jpeg', '.jfif': 'image/jpeg',
  '.bmp': 'image/bmp', '.dib': 'image/bmp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.avif': 'image/avif', '.svg': 'image/svg+xml'
}
const IMAGE_EXTS = Object.keys(MIME).map(e => e.slice(1))

function createWindow () {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 560,
    minHeight: 400,
    title: 'Безымянный - Paint',
    icon: path.join(__dirname, 'app', 'img', 'icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#ffffff', symbolColor: '#000000', height: 30 },
    backgroundColor: '#ffffff',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  })
  steam.setWindow(win)
  win.removeMenu()
  win.loadFile(path.join(__dirname, 'app', 'index.html'))
  win.once('ready-to-show', () => {
    win.show()
    if (process.env.PAINT_DEVTOOLS) win.webContents.openDevTools({ mode: 'detach' })
  })
  win.on('close', e => {
    if (!allowClose) {
      e.preventDefault()
      win.webContents.send('app:close-request')
    }
  })
  win.on('enter-full-screen', () => win.webContents.send('win:fullscreen', true))
  win.on('leave-full-screen', () => win.webContents.send('win:fullscreen', false))
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', e => e.preventDefault())

  if (process.env.PAINT_CONSOLE) {
    win.webContents.on('console-message', (e, level, message, line, source) => console.log('[renderer]', level, message, source + ':' + line))
  }
  if (process.env.PAINT_SCREENSHOT) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        if (process.env.PAINT_EVAL) {
          try { console.log('[eval]', JSON.stringify(await win.webContents.executeJavaScript(process.env.PAINT_EVAL))) } catch (e) { console.log('[eval error]', e.message) }
          await new Promise(r => setTimeout(r, 500)) // let the window repaint
        }
        const img = await win.webContents.capturePage()
        fs.writeFileSync(process.env.PAINT_SCREENSHOT, img.toPNG())
        if (process.env.PAINT_SCREENSHOT_QUIT) { allowClose = true; app.quit() }
      }, Number(process.env.PAINT_SCREENSHOT_DELAY || 2500))
    })
  }
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { steam.shutdown(); app.quit() })
app.on('before-quit', () => steam.shutdown())

function readImageFile (p) {
  const buf = fs.readFileSync(p)
  const ext = path.extname(p).toLowerCase()
  const mime = MIME[ext] || 'application/octet-stream'
  const st = fs.statSync(p)
  return { path: p, name: path.basename(p), size: st.size, mtime: st.mtimeMs, dataURL: 'data:' + mime + ';base64,' + buf.toString('base64') }
}

ipcMain.handle('file:open', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: L('Открыть'),
    properties: ['openFile'],
    filters: [
      { name: L('Все файлы изображений'), extensions: IMAGE_EXTS },
      { name: L('Все файлы'), extensions: ['*'] }
    ]
  })
  if (r.canceled || !r.filePaths.length) return null
  try { return readImageFile(r.filePaths[0]) } catch (e) { return { error: e.message } }
})

ipcMain.handle('file:read', async (e, p) => {
  try { return readImageFile(p) } catch (err) { return { error: err.message } }
})

ipcMain.handle('file:pickSave', async (e, opts) => {
  const filters = [
    { name: 'PNG', extensions: ['png'] },
    { name: 'JPEG', extensions: ['jpg', 'jpeg', 'jpe', 'jfif'] },
    { name: L('24-разрядный рисунок'), extensions: ['bmp', 'dib'] }
  ]
  const order = { png: 0, jpg: 1, bmp: 2 }
  const first = order[opts && opts.format] || 0
  const sorted = [filters[first], ...filters.filter((_, i) => i !== first)]
  const r = await dialog.showSaveDialog(win, {
    title: L('Сохранить как'),
    defaultPath: (opts && opts.defaultName) || L('Безымянный') + '.png',
    filters: sorted
  })
  if (r.canceled || !r.filePath) return null
  return r.filePath
})

ipcMain.handle('file:write', async (e, p, data) => {
  try {
    fs.writeFileSync(p, Buffer.from(data))
    const st = fs.statSync(p)
    return { path: p, name: path.basename(p), size: st.size, mtime: st.mtimeMs }
  } catch (err) {
    return { error: err.message }
  }
})

// An image from the web, for drag & drop and paste of links (http/https only).
const FETCH_MAX = 64 * 1024 * 1024
async function fetchImage (url) {
  if (!/^https?:\/\//i.test(String(url))) return null
  try {
    const r = await net.fetch(url)
    const type = (r.headers.get('content-type') || '').split(';')[0].trim()
    if (!r.ok || !type.startsWith('image/')) return null
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length > FETCH_MAX) return null
    return 'data:' + type + ';base64,' + buf.toString('base64')
  } catch (e) {
    log('[main] image download failed', e.message)
    return null
  }
}

const isImagePath = p => !!MIME[path.extname(p).toLowerCase()]

// Paste: a bitmap, else an image file copied in Explorer, else a picture in
// copied HTML (browsers), else a copied link or path to an image.
async function clipboardImage () {
  const img = clipboard.readImage()
  if (!img.isEmpty()) return img.toDataURL()
  let file = null
  try {
    const raw = clipboard.readBuffer('FileNameW')
    if (raw && raw.length) file = raw.toString('utf16le').split('\0')[0]
  } catch (e) {}
  if (file && isImagePath(file)) { try { return readImageFile(file).dataURL } catch (e) {} }
  const html = clipboard.readHTML() || ''
  const m = html.match(/<img[^>]+src\s*=\s*["']([^"']+)["']/i)
  const text = (clipboard.readText() || '').trim()
  for (const s of [m && m[1].replace(/&amp;/g, '&'), text]) {
    if (!s) continue
    if (/^data:image\//i.test(s)) return s
    if (/^https?:\/\//i.test(s)) { const u = await fetchImage(s); if (u) return u }
    if (/^[a-z]:[\\/]/i.test(s) && isImagePath(s) && fs.existsSync(s)) { try { return readImageFile(s).dataURL } catch (e) {} }
  }
  return null
}

ipcMain.handle('clip:read', () => clipboardImage())
ipcMain.handle('file:fetchImage', (e, url) => fetchImage(url))
ipcMain.handle('clip:write', (e, url) => {
  clipboard.writeImage(nativeImage.createFromDataURL(url))
  return true
})

// ---- standard Windows menus and dialogs for the renderer's UI
// Popup menu from a template: { id, label, type, checked, disabled,
// shortcut, icon: {url, scale}, sub: [...] } | { sep: true }.
// Resolves with the id of the clicked item, or null.
ipcMain.handle('menu:popup', (e, items, x, y) => new Promise(resolve => {
  if (!win) return resolve(null)
  let done = false
  const finish = v => { if (!done) { done = true; resolve(v) } }
  const build = list => Menu.buildFromTemplate(list.map(it => {
    if (it.sep) return { type: 'separator' }
    const o = { label: String(it.label || '').replace(/&/g, '&&'), enabled: !it.disabled }
    if (it.sub) o.submenu = build(it.sub)
    else o.click = () => finish(it.id)
    if (it.type === 'checkbox' || it.type === 'radio') { o.type = it.type; o.checked = !!it.checked }
    if (it.shortcut) { o.accelerator = it.shortcut; o.registerAccelerator = false }
    if (it.icon && it.icon.url) {
      try {
        const img = nativeImage.createEmpty()
        img.addRepresentation({ scaleFactor: it.icon.scale || 1, dataURL: it.icon.url })
        o.icon = img
      } catch (err) {}
    }
    return o
  }))
  try {
    const menu = build(items)
    // a click arrives after the menu has closed
    menu.popup({ window: win, x: Math.round(x), y: Math.round(y), callback: () => setTimeout(() => finish(null), 150) })
    if (process.env.PAINT_TEST_MENU) {
      const desc = m => m.items.map(i => i.type === 'separator' ? '-' : (i.label + (i.type === 'radio' || i.type === 'checkbox' ? (i.checked ? ' [x]' : ' [ ]') : '') +
        (i.enabled ? '' : ' (off)') + (i.icon ? ' {' + i.icon.getSize().width + 'x' + i.icon.getSize().height + '}' : '') +
        (i.accelerator ? ' <' + i.accelerator + '>' : '') + (i.submenu ? ' > [' + desc(i.submenu).join(' | ') + ']' : '')))
      console.log('[menu]', desc(menu).join(' | '))
      setTimeout(() => menu.closePopup(win), 600)
    }
  } catch (err) {
    log('[main] menu failed', err.message)
    finish(null)
  }
}))

ipcMain.handle('dlg:message', async (e, o) => {
  if (!win) return -1
  const r = await dialog.showMessageBox(win, {
    type: ['none', 'info', 'error', 'question', 'warning'].includes(o.type) ? o.type : 'none',
    title: String(o.title || 'Paint'),
    message: String(o.message || ''),
    detail: o.detail ? String(o.detail) : undefined,
    buttons: (o.buttons || ['OK']).map(String),
    defaultId: o.defaultId || 0,
    cancelId: o.cancelId != null ? o.cancelId : -1,
    noLink: true
  })
  return r.response
})

ipcMain.handle('dlg:color', (e, rgb, custom) => win32.chooseColor(win, rgb, custom))

ipcMain.on('win:title', (e, t) => { if (win) win.setTitle(String(t)) })
ipcMain.on('app:lang', (e, l) => { uiLang = l === 'en' ? 'en' : 'ru' })
ipcMain.on('win:fullscreen', (e, f) => { if (win) win.setFullScreen(!!f) })
ipcMain.on('app:quit', () => { allowClose = true; if (win) win.close() })
ipcMain.handle('app:args', () => startArgs)
ipcMain.handle('app:version', () => app.getVersion())

// PAINT_NO_STEAM: test runs that must not touch the Steam account
ipcMain.handle('steam:init', () => process.env.PAINT_NO_STEAM ? { ok: false, error: 'Steam отключён (PAINT_NO_STEAM)' } : steam.init())
ipcMain.handle('steam:status', () => steam.status())
ipcMain.handle('steam:createLobby', (e, type, max) => steam.createLobby(type, max))
ipcMain.handle('steam:joinLobby', (e, id) => steam.joinLobby(id))
ipcMain.handle('steam:leaveLobby', () => { steam.leaveLobby(); return true })
ipcMain.handle('steam:listLobbies', () => steam.listLobbies())
ipcMain.handle('steam:lobbyState', () => steam.lobbyState())
ipcMain.handle('steam:invite', () => steam.invite())
ipcMain.handle('steam:friends', () => steam.openFriends())
ipcMain.handle('steam:friendList', () => steam.friendList())
ipcMain.handle('steam:inviteFriend', (e, id) => steam.inviteFriend(id))
ipcMain.on('steam:send', (e, targets, text, reliable) => steam.send(targets, text, reliable))
ipcMain.handle('steam:diagnostics', () => steam.diagnostics())
ipcMain.on('log', (e, line) => log('[net]', String(line).slice(0, 2000)))
ipcMain.handle('log:open', () => { fs.mkdirSync(logDir, { recursive: true }); return shell.openPath(logDir) })
