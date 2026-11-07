const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('surge', {
  on: (ch, cb) => ipcRenderer.on(ch, (_e, p) => cb(p)),
  done: () => ipcRenderer.send('glow:done'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  resetSettings: () => ipcRenderer.invoke('settings:reset'),
  listModules: () => ipcRenderer.invoke('modules:list'),
  hookState: () => ipcRenderer.invoke('hook:state'),
  action: (id, name, arg) => ipcRenderer.invoke('module:action', id, name, arg),
  getBattery: () => ipcRenderer.invoke('battery:get'),
  preview: (kind) => ipcRenderer.send('glow:preview', kind),
  testSound: (sound, opts) => ipcRenderer.send('audio:test', sound, opts),
  close: () => ipcRenderer.send('win:close'), hide: () => ipcRenderer.send('win:hide'), minimize: () => ipcRenderer.send('win:minimize'),
  quit: () => ipcRenderer.send('app:quit'), openSettings: () => ipcRenderer.send('open:settings'), toggleNotes: () => ipcRenderer.send('notes:toggle'), openExternal: (u) => ipcRenderer.send('open:external', u),
  notesLoad: () => ipcRenderer.invoke('notes:load'), notesSave: (t) => ipcRenderer.send('notes:save', t),
  platform: process.platform,
});
