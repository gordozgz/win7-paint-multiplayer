'use strict'
const { contextBridge, ipcRenderer } = require('electron')

const on = (ch, cb) => ipcRenderer.on(ch, (e, ...args) => cb(...args))

contextBridge.exposeInMainWorld('native', {
  isElectron: true,
  openFile: () => ipcRenderer.invoke('file:open'),
  readFile: p => ipcRenderer.invoke('file:read', p),
  pickSavePath: opts => ipcRenderer.invoke('file:pickSave', opts),
  writeFile: (p, data) => ipcRenderer.invoke('file:write', p, data),
  readClipboardImage: () => ipcRenderer.invoke('clip:read'),
  fetchImage: url => ipcRenderer.invoke('file:fetchImage', url),
  popupMenu: (items, x, y) => ipcRenderer.invoke('menu:popup', items, x, y),
  messageBox: opts => ipcRenderer.invoke('dlg:message', opts),
  chooseColor: (rgb, custom) => ipcRenderer.invoke('dlg:color', rgb, custom),
  writeClipboardImage: url => ipcRenderer.invoke('clip:write', url),
  setTitle: t => ipcRenderer.send('win:title', t),
  setFullScreen: f => ipcRenderer.send('win:fullscreen', f),
  onFullScreen: cb => on('win:fullscreen', cb),
  quit: () => ipcRenderer.send('app:quit'),
  onCloseRequest: cb => on('app:close-request', cb),
  args: () => ipcRenderer.invoke('app:args'),
  version: () => ipcRenderer.invoke('app:version'),
  log: line => ipcRenderer.send('log', line),
  setLang: l => ipcRenderer.send('app:lang', l),
  openLog: () => ipcRenderer.invoke('log:open'),
  steam: {
    init: () => ipcRenderer.invoke('steam:init'),
    status: () => ipcRenderer.invoke('steam:status'),
    createLobby: (type, max) => ipcRenderer.invoke('steam:createLobby', type, max),
    joinLobby: id => ipcRenderer.invoke('steam:joinLobby', id),
    leaveLobby: () => ipcRenderer.invoke('steam:leaveLobby'),
    listLobbies: () => ipcRenderer.invoke('steam:listLobbies'),
    lobbyState: () => ipcRenderer.invoke('steam:lobbyState'),
    invite: () => ipcRenderer.invoke('steam:invite'),
    openFriends: () => ipcRenderer.invoke('steam:friends'),
    friendList: () => ipcRenderer.invoke('steam:friendList'),
    inviteFriend: id => ipcRenderer.invoke('steam:inviteFriend', id),
    send: (targets, text, reliable) => ipcRenderer.send('steam:send', targets, text, reliable),
    onPacket: cb => on('steam:packet', cb),
    onProgress: cb => on('steam:progress', cb),
    onLobby: cb => on('steam:lobby', cb),
    onJoinRequest: cb => on('steam:joinRequest', cb),
    onP2PFail: cb => on('steam:p2pfail', cb),
    onWarn: cb => on('steam:warn', cb),
    diagnostics: () => ipcRenderer.invoke('steam:diagnostics')
  }
})
