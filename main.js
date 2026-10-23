'use strict'
const { app, BrowserWindow, ipcMain, dialog, clipboard, nativeImage, shell } = require('electron')
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
  '.bmp': 'image/bmp', '.dib': 'image/bmp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.webp': 'image/webp'
}

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
      { name: L('Все файлы изображений'), extensions: ['bmp', 'dib', 'jpg', 'jpeg', 'jpe', 'jfif', 'gif', 'png', 'ico', 'webp'] },
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

ipcMain.handle('clip:read', () => {
  const img = clipboard.readImage()
  return img.isEmpty() ? null : img.toDataURL()
})
ipcMain.handle('clip:write', (e, url) => {
  clipboard.writeImage(nativeImage.createFromDataURL(url))
  return true
})

ipcMain.on('win:title', (e, t) => { if (win) win.setTitle(String(t)) })
ipcMain.on('app:lang', (e, l) => { uiLang = l === 'en' ? 'en' : 'ru' })
ipcMain.on('win:fullscreen', (e, f) => { if (win) win.setFullScreen(!!f) })
ipcMain.on('app:quit', () => { allowClose = true; if (win) win.close() })
ipcMain.handle('app:args', () => startArgs)
ipcMain.handle('app:version', () => app.getVersion())

ipcMain.handle('steam:init', () => steam.init())
ipcMain.handle('steam:status', () => steam.status())
ipcMain.handle('steam:createLobby', (e, type, max) => steam.createLobby(type, max))
ipcMain.handle('steam:joinLobby', (e, id) => steam.joinLobby(id))
ipcMain.handle('steam:leaveLobby', () => { steam.leaveLobby(); return true })
ipcMain.handle('steam:listLobbies', () => steam.listLobbies())
ipcMain.handle('steam:lobbyState', () => steam.lobbyState())
ipcMain.handle('steam:invite', () => steam.invite())
ipcMain.handle('steam:friends', () => steam.openFriends())
ipcMain.on('steam:send', (e, targets, text, reliable) => steam.send(targets, text, reliable))
ipcMain.handle('steam:diagnostics', () => steam.diagnostics())
ipcMain.on('log', (e, line) => log('[net]', String(line).slice(0, 2000)))
ipcMain.handle('log:open', () => { fs.mkdirSync(logDir, { recursive: true }); return shell.openPath(logDir) })
