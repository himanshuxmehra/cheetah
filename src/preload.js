const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cheetah', {
  loadWorkspace: () => ipcRenderer.invoke('workspace:load'),
  saveWorkspace: (data) => ipcRenderer.invoke('workspace:save', data),
  send: (id, request) => ipcRenderer.invoke('http:send', id, request),
  cancel: (id) => ipcRenderer.invoke('http:cancel', id),
  setTheme: (theme) => ipcRenderer.invoke('theme:set', theme),
  exportFile: (name, contents) => ipcRenderer.invoke('file:export', name, contents),
  importFile: () => ipcRenderer.invoke('file:import'),
  saveBody: (name, base64) => ipcRenderer.invoke('file:saveBody', name, base64),
  onProgress: (handler) => {
    const listener = (_event, id, received) => handler(id, received);
    ipcRenderer.on('http:progress', listener);
    return () => ipcRenderer.off('http:progress', listener);
  },
  platform: process.platform
});
