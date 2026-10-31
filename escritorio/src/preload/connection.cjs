// Presentazo para escritorio: puente entre la conexión con los celulares y el proceso principal.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('presentazo', {
  identity: () => ipcRenderer.invoke('conn:identity'),
  status: (status, error = null) => ipcRenderer.send('conn:status', { status, error }),
  devices: (payload) => ipcRenderer.send('conn:devices', payload),
  welcome: () => ipcRenderer.invoke('conn:welcome'),
  capture: () => ipcRenderer.invoke('conn:capture'),
  command: (cmd) => ipcRenderer.invoke('conn:cmd', cmd),
  onMain: (fn) => ipcRenderer.on('conn:main', (_e, msg) => fn(msg)),
});
