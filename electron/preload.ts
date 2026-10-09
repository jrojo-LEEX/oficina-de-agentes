import { contextBridge, ipcRenderer } from 'electron'

import type { LiveSession, OverlayCommand, OverlayState, SavePatch } from './shared'

// The renderer's only way out: a handful of named messages, no Node.
contextBridge.exposeInMainWorld('overlay', {
  ready: (): Promise<OverlayState> => ipcRenderer.invoke('ready'),
  setCapture: (isCapturing: boolean) => ipcRenderer.send('capture', isCapturing),
  setInteractive: (isInteractive: boolean) => ipcRenderer.send('interactive', isInteractive),
  hide: () => ipcRenderer.send('hide'),
  save: (patch: SavePatch) => ipcRenderer.send('save', patch),
  onState: (listener: (state: OverlayState) => void) => {
    ipcRenderer.on('state', (_event, state: OverlayState) => listener(state))
  },
  onPointer: (listener: (point: { x: number; y: number }) => void) => {
    ipcRenderer.on('pointer', (_event, point: { x: number; y: number }) => listener(point))
  },
  onCommand: (listener: (command: OverlayCommand) => void) => {
    ipcRenderer.on('command', (_event, command: OverlayCommand) => listener(command))
  },
  onAgents: (listener: (sessions: LiveSession[]) => void) => {
    ipcRenderer.on('agents', (_event, sessions: LiveSession[]) => listener(sessions))
  },
  saveRecording: (name: string, bytes: ArrayBuffer): Promise<string> => ipcRenderer.invoke('save-recording', name, bytes),
  onSpend: (listener: (spend: { sessions: unknown[]; clientFolders: string[] }) => void) => {
    ipcRenderer.on('spend', (_event, spend: { sessions: unknown[]; clientFolders: string[] }) => listener(spend))
  },
  onReplay: (listener: (data: unknown) => void) => {
    ipcRenderer.on('replay', (_event, data: unknown) => listener(data))
  },
  selftestShot: (name: string): Promise<void> => ipcRenderer.invoke('selftest-shot', name),
  selftestDone: (report: Record<string, unknown>) => ipcRenderer.send('selftest-done', report),
  reportError: (text: string) => ipcRenderer.send('renderer-error', text),
  diagnostics: (report: Record<string, unknown>) => ipcRenderer.send('diagnostics', report),
  notify: (title: string, body: string) => ipcRenderer.send('notify', title, body),
  limits: (limits: unknown) => ipcRenderer.send('limits', limits),
})
