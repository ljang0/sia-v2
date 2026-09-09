import { contextBridge, ipcRenderer } from 'electron';
import type { LauncherApi, LauncherState } from '../shared/launcher.js';
const api: LauncherApi = {
  state: () => ipcRenderer.invoke('sia:launcher:state'),
  onState: (listener) => {
    const receive = (_event: Electron.IpcRendererEvent, state: LauncherState) =>
      listener(state);
    ipcRenderer.on('sia:launcher:changed', receive);
    return () => ipcRenderer.removeListener('sia:launcher:changed', receive);
  },
  send: (input) => ipcRenderer.invoke('sia:launcher:send', input),
  cancel: (sessionId) => ipcRenderer.invoke('sia:launcher:cancel', sessionId),
  newRequest: (sessionId) => ipcRenderer.invoke('sia:launcher:new', sessionId),
  dismiss: () => ipcRenderer.invoke('sia:launcher:dismiss'),
  openSia: (sessionId) => ipcRenderer.invoke('sia:launcher:open', sessionId),
};
contextBridge.exposeInMainWorld('siaLauncher', api);
