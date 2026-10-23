'use strict'
// Renders the app icon SVG to app/img/icon.png and build/icon.ico (PNG-in-ICO).
// Run: npx electron build/make-icon.js
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbe6b0"/><stop offset="1" stop-color="#e9c46a"/></linearGradient></defs>
<path d="M31 5C15 5 3 16 3 30.5 3 45 14.5 57 29.5 57c4.2 0 6.3-2.2 6.3-5.2 0-3.4-3-4.2-3-7.4 0-3 2.4-5.1 5.6-5.1h7.4c8.6 0 15.2-6 15.2-14.3C61 14.6 48 5 31 5z" fill="url(#g)" stroke="#9a6f1e" stroke-width="2"/>
<circle cx="15.5" cy="30" r="5.2" fill="#e81123" stroke="#8f0a16" stroke-width="1"/>
<circle cx="22" cy="17" r="5.2" fill="#16a02c" stroke="#0b5c19" stroke-width="1"/>
<circle cx="36" cy="13.5" r="5.2" fill="#0a78d6" stroke="#06467c" stroke-width="1"/>
<circle cx="48.5" cy="21.5" r="4.8" fill="#ffb900" stroke="#9b7000" stroke-width="1"/>
<circle cx="18.5" cy="43.5" r="4.4" fill="#8764b8" stroke="#4f3a6e" stroke-width="1"/>
<path d="M62 33 47 48" stroke="#8a5a2b" stroke-width="5.5" stroke-linecap="round"/>
<path d="M47.6 47.4 44 51" stroke="#b7bec7" stroke-width="6.5"/>
<path d="M44.6 49.2c-2.8 2.6-4.2 6.8-9 9.3 4.9.9 10.6-.6 12.4-5.4z" fill="#0a78d6" stroke="#06467c" stroke-width="1"/>
</svg>`

function ico (pngs) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4)
  const dir = Buffer.alloc(16 * pngs.length)
  let offset = 6 + dir.length
  pngs.forEach((p, i) => {
    const o = i * 16
    dir[o] = p.size >= 256 ? 0 : p.size; dir[o + 1] = p.size >= 256 ? 0 : p.size
    dir[o + 2] = 0; dir[o + 3] = 0
    dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6)
    dir.writeUInt32LE(p.buf.length, o + 8); dir.writeUInt32LE(offset, o + 12)
    offset += p.buf.length
  })
  return Buffer.concat([header, dir, ...pngs.map(p => p.buf)])
}

app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, width: 300, height: 300 })
  await w.loadURL('data:text/html,<html><body></body></html>')
  const sizes = [16, 24, 32, 48, 64, 128, 256]
  const out = await w.webContents.executeJavaScript(`(async () => {
    const img = new Image(); img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(${JSON.stringify(SVG)}); await img.decode();
    const res = {};
    for (const s of ${JSON.stringify(sizes)}) { const c = document.createElement('canvas'); c.width = c.height = s; const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, s, s); res[s] = c.toDataURL('image/png'); }
    return res; })()`)
  const pngs = sizes.map(s => ({ size: s, buf: Buffer.from(out[s].split(',')[1], 'base64') }))
  const root = path.join(__dirname, '..')
  fs.mkdirSync(path.join(root, 'app', 'img'), { recursive: true })
  fs.writeFileSync(path.join(root, 'app', 'img', 'icon.png'), pngs.find(p => p.size === 256).buf)
  fs.writeFileSync(path.join(root, 'build', 'icon.ico'), ico(pngs.filter(p => [16, 24, 32, 48, 256].includes(p.size))))
  console.log('icon written')
  app.quit()
})
