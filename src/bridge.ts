// The bridge the preload script exposes on `window.overlay`. The main process
// declares the same shapes in electron/shared.ts.

import type { LiveSession } from './office/types.ts'
import type { SpendSession } from './spend.ts'

export type OverlayState = {
  isInteractive: boolean
  /** The whip toy: off unless the person turned it on from the tray. */
  isWhipOn: boolean
  language: 'es' | 'en'
  /** What the empty corner says: all set, or what is missing. */
  setup: 'ok' | 'no-claude' | 'no-mod' | 'old-mod' | 'mod-off'
  isOfficeShown: boolean
  officeCorner: 'br' | 'bl' | 'tr' | 'tl'
  officeSize: 's' | 'm' | 'l'
  officeTheme: 'auto' | 'normal' | 'night' | 'party'
  officeLayout: 'horizontal' | 'tower' | 'wings'
  officeStyle: 'ilustrado' | 'pixel'
  /** Fewer things moving: no sparks, no trail, no fidgeting. */
  isCalm: boolean
  whipProfile: 'classic' | 'short' | 'long' | 'flexible'
  /** Precision rings to touch with the tip. */
  isTargets: boolean
  /** A crack when someone starts waiting for permission. */
  isAlertSound: boolean
  isMuted: boolean
  volume: number
  anchor: { x: number; y: number } | null
  shortcuts: { interactive: string; visible: string }
  isSelftest: boolean
}

export type OverlayCommand =
  | { type: 'visible'; isVisible: boolean }
  | { type: 'recenter' }
  | { type: 'report' }
  | { type: 'clip' }
  | { type: 'timelapse' }
  | { type: 'export-replay' }
  | { type: 'spend' }
  | { type: 'diag' }

export type SelftestReport = Record<string, unknown>

export type OverlayBridge = {
  ready: () => Promise<OverlayState>
  setCapture: (isCapturing: boolean) => void
  setInteractive: (isInteractive: boolean) => void
  hide: () => void
  save: (
    patch: Partial<
      Pick<
        OverlayState,
        | 'isMuted'
        | 'volume'
        | 'anchor'
        | 'isOfficeShown'
        | 'officeCorner'
        | 'officeSize'
        | 'officeTheme'
        | 'officeLayout'
        | 'officeStyle'
        | 'isCalm'
        | 'isAlertSound'
        | 'whipProfile'
        | 'isTargets'
      >
    >,
  ) => void
  onState: (listener: (state: OverlayState) => void) => void
  onCommand: (listener: (command: OverlayCommand) => void) => void
  /** The pointer's position, read from the system while interactive and not holding the mouse. */
  onPointer: (listener: (point: { x: number; y: number }) => void) => void
  onAgents: (listener: (sessions: LiveSession[]) => void) => void
  /** Saves a recording (a video or a replay) in Videos\\Oficina de agentes; resolves where it went. */
  saveRecording: (name: string, bytes: ArrayBuffer) => Promise<string>
  /** Every session's time and tokens, from Claude Code's transcripts: sent after each scan. */
  onSpend: (listener: (spend: { sessions: SpendSession[]; clientFolders: string[] }) => void) => void
  /** A replay file the person opened from the tray, parsed but unchecked. */
  onReplay: (listener: (data: unknown) => void) => void
  selftestShot: (name: string) => Promise<void>
  selftestDone: (report: SelftestReport) => void
  /** Shows a Windows notification; clicking it opens the spending panel. */
  notify: (title: string, body: string) => void
  /** The account's rate-limit windows, for the main process's warnings. */
  limits: (limits: { kind: string; percentUsed: number; resetsAt: string }[]) => void
  /** This side's state and its last events, for a "it got stuck" report. */
  diagnostics: (report: Record<string, unknown>) => void
  /** Writes an error of the page down in the app's log. */
  reportError: (text: string) => void
}

declare global {
  interface Window {
    overlay: OverlayBridge
  }
}
