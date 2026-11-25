// The Nova menu's and dialog's only bridge: the items in, which one was picked and how tall the window must be out.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('nova', {
  onMenu: cb => ipcRenderer.on('nova:menu', (_e, p) => cb(p)),
  pick: (id, checked) => ipcRenderer.send('nova:pick', id, checked),
  size: h => ipcRenderer.send('nova:size', h),
  close: () => ipcRenderer.send('nova:close'),
  answer: i => ipcRenderer.send('nova:answer', i),
  dsize: h => ipcRenderer.send('nova:dsize', h),
});
