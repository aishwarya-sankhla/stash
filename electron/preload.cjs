// Exposes a small file-storage API to the UI. The UI has no other access to Node or the file system.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('stashDesktop', {
  load: () => ipcRenderer.sendSync('stash:load'),
  save: (json) => ipcRenderer.invoke('stash:save', json),
  moveTo: (json) => ipcRenderer.invoke('stash:moveTo', json),
  openFile: () => ipcRenderer.invoke('stash:openFile'),
  reveal: () => ipcRenderer.invoke('stash:reveal'),
  pickExpenses: () => ipcRenderer.invoke('stash:pickExpenses'),
  trashExpenses: () => ipcRenderer.invoke('stash:trashExpenses'),
})
