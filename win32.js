'use strict'
// Standard Windows dialogs Electron has no API for: the color picker
// (ChooseColorW from comdlg32 — the same dialog Paint itself opens).
//
// The dialog runs on a koffi worker thread with Paint's window as its owner:
// it is modal for the window, while the main process keeps running (Steam
// packets, IPC).
let api = null

const CC_RGBINIT = 0x1
const CC_FULLOPEN = 0x2
const CC_ANYCOLOR = 0x100

function load () {
  if (api !== null) return api
  api = false
  if (process.platform !== 'win32') return api
  try {
    const koffi = require('koffi')
    const comdlg = koffi.load('comdlg32.dll')
    // pointer-sized members are declared as uint64 (x64 build only)
    const CHOOSECOLORW = koffi.struct('CHOOSECOLORW', {
      lStructSize: 'uint32',
      hwndOwner: 'uint64',
      hInstance: 'uint64',
      rgbResult: 'uint32',
      lpCustColors: 'uint64',
      Flags: 'uint32',
      lCustData: 'uint64',
      lpfnHook: 'uint64',
      lpTemplateName: 'uint64'
    })
    api = { koffi, CHOOSECOLORW, ChooseColorW: comdlg.func('int ChooseColorW(CHOOSECOLORW *cc)') }
  } catch (e) {
    console.warn('[win32] comdlg32 unavailable:', e.message)
  }
  return api
}

const toRef = c => (c[0] | (c[1] << 8) | (c[2] << 16)) >>> 0
const fromRef = v => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255]

// rgb: [r,g,b]; custom: 16 colors (or null). Resolves to
// { color: [r,g,b] | null (cancelled), custom } or { unavailable: true }.
function chooseColor (win, rgb, custom) {
  const a = load()
  if (!a || !win || win.isDestroyed()) return Promise.resolve({ unavailable: true })
  const { koffi } = a
  const cust = koffi.alloc('uint32', 16)
  const cc = koffi.alloc(a.CHOOSECOLORW, 1)
  try {
    const list = []
    for (let i = 0; i < 16; i++) list.push(custom && custom[i] ? toRef(custom[i]) : 0xFFFFFF)
    koffi.encode(cust, 'uint32', list, 16)
    koffi.encode(cc, a.CHOOSECOLORW, {
      lStructSize: koffi.sizeof(a.CHOOSECOLORW),
      hwndOwner: win.getNativeWindowHandle().readBigUInt64LE(0),
      hInstance: 0n,
      rgbResult: toRef(rgb || [0, 0, 0]),
      lpCustColors: koffi.address(cust),
      Flags: CC_RGBINIT | CC_FULLOPEN | CC_ANYCOLOR,
      lCustData: 0n,
      lpfnHook: 0n,
      lpTemplateName: 0n
    })
  } catch (e) {
    koffi.free(cc); koffi.free(cust)
    return Promise.resolve({ unavailable: true })
  }
  return new Promise(resolve => {
    a.ChooseColorW.async(cc, (err, ok) => {
      try {
        if (err) { resolve({ unavailable: true }); return }
        const out = koffi.decode(cc, a.CHOOSECOLORW)
        const list = koffi.decode(cust, 'uint32', 16)
        resolve({ color: ok ? fromRef(out.rgbResult) : null, custom: Array.from(list, fromRef) })
      } catch (e) {
        resolve({ unavailable: true })
      } finally {
        koffi.free(cc); koffi.free(cust)
      }
    })
  })
}

module.exports = { chooseColor }
