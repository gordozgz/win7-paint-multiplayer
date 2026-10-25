'use strict'
// Builds a portable Windows folder: dist/Paint-<version>/Paint.exe
// (same layout @electron/packager produces; done by hand because its zip
// extraction silently fails on Node 24).  Run: node build/pack.js
// The folder name stays short: Chromium can't read files past MAX_PATH (260).
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const version = require(path.join(root, 'package.json')).version
const out = path.join(root, 'dist', 'Paint-' + version)
const electronDist = path.join(root, 'node_modules', 'electron', 'dist')

function copyModule (name, filter) {
  const src = path.join(root, 'node_modules', name)
  const dst = path.join(out, 'resources', 'app', 'node_modules', name)
  fs.cpSync(src, dst, { recursive: true, filter: filter || (() => true) })
}

async function main () {
  if (!fs.existsSync(path.join(electronDist, 'electron.exe'))) throw new Error('Electron binary missing: ' + electronDist)
  fs.rmSync(out, { recursive: true, force: true })
  fs.cpSync(electronDist, out, { recursive: true })
  fs.rmSync(path.join(out, 'resources', 'default_app.asar'), { force: true })
  fs.renameSync(path.join(out, 'electron.exe'), path.join(out, 'Paint.exe'))

  const appDir = path.join(out, 'resources', 'app')
  fs.mkdirSync(appDir, { recursive: true })
  for (const f of ['main.js', 'preload.js', 'steam.js', 'win32.js']) fs.copyFileSync(path.join(root, f), path.join(appDir, f))
  const pkg = require(path.join(root, 'package.json'))
  fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({
    name: pkg.name, productName: pkg.productName, version: pkg.version, description: pkg.description, main: pkg.main, dependencies: pkg.dependencies
  }, null, 2))
  fs.cpSync(path.join(root, 'app'), path.join(appDir, 'app'), { recursive: true })

  copyModule('steamworks.js', p => !/[\\/]dist[\\/](linux64|osx)([\\/]|$)/.test(p) && !/\.lib$/.test(p))
  copyModule('koffi', p => !/[\\/]koffi[\\/](doc|vendor)([\\/]|$)/.test(p))
  copyModule(path.join('@koromix', 'koffi-win32-x64'))

  fs.writeFileSync(path.join(out, 'steam_appid.txt'), '480')

  // exe icon + version strings
  const ResEdit = await import('resedit')
  const PE = await import('pe-library')
  const exePath = path.join(out, 'Paint.exe')
  const exe = PE.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true })
  const res = PE.NtExecutableResource.from(exe)
  const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(__dirname, 'icon.ico')))
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries)
  const gid = groups.length ? groups[0].id : 1
  const glang = groups.length ? groups[0].lang : 1033
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, gid, glang, iconFile.icons.map(i => i.data))
  const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0]
  if (vi) {
    for (const l of vi.getAllLanguagesForStringValues()) {
      vi.setStringValues(l, {
        ProductName: 'Paint', FileDescription: 'Paint (мультиплеер)', CompanyName: 'MP Paint',
        InternalName: 'Paint', OriginalFilename: 'Paint.exe', LegalCopyright: ''
      })
    }
    vi.outputToResourceEntries(res.entries)
  }
  res.outputResource(exe)
  fs.writeFileSync(exePath, Buffer.from(exe.generate()))
  console.log('built', out)
}

main().catch(e => { console.error(e); process.exit(1) })
