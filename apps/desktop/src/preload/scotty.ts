import { contextBridge, ipcRenderer } from 'electron';
import type { ScottyApi, ScottyState } from '../shared/scotty.js';
const api: ScottyApi = {
  state: () => ipcRenderer.invoke('sia:scotty:state'),
  onState: (listener) => {
    const receive = (_event: Electron.IpcRendererEvent, state: ScottyState) => listener(state);
    ipcRenderer.on('sia:scotty:changed', receive);
    return () => ipcRenderer.removeListener('sia:scotty:changed', receive);
  },
  action: (action) => ipcRenderer.invoke('sia:scotty:action', action),
  expand: (open) => ipcRenderer.invoke('sia:scotty:expand', open),
  hide: () => ipcRenderer.invoke('sia:scotty:hide'),
  openSia: () => ipcRenderer.invoke('sia:scotty:open'),
  move: (phase) => ipcRenderer.invoke('sia:scotty:move', phase),
  nudge: (dx, dy) => ipcRenderer.invoke('sia:scotty:nudge', { dx, dy }),
  interactive: (value) => ipcRenderer.send('sia:scotty:interactive', value),
};
contextBridge.exposeInMainWorld('siaScotty', api);
