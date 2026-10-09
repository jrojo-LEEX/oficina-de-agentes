import { contextBridge, ipcRenderer } from 'electron'

import type { SetupPatch, SetupView } from './shared'

// The guide's window: what it shows, and the few things it can ask for.
contextBridge.exposeInMainWorld('setup', {
  view: (): Promise<SetupView> => ipcRenderer.invoke('setup-view'),
  refresh: (): Promise<SetupView> => ipcRenderer.invoke('setup-refresh'),
  copy: (text: string): Promise<void> => ipcRenderer.invoke('setup-copy', text),
  save: (patch: SetupPatch): Promise<SetupView> => ipcRenderer.invoke('setup-save', patch),
  demo: (): Promise<void> => ipcRenderer.invoke('setup-demo'),
  open: (what: 'repo' | 'releases'): Promise<void> => ipcRenderer.invoke('setup-open', what),
  close: (): Promise<void> => ipcRenderer.invoke('setup-close'),
})
