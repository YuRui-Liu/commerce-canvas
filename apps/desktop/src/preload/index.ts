import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('commerceCanvas', Object.freeze({ health: () => ipcRenderer.invoke('runtime:health') }));
