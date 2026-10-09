// Shapes that cross between the main process and the renderer. The renderer
// declares the same ones in src/bridge.ts.

export type Point = { x: number; y: number }

export type Shortcuts = { interactive: string; visible: string }

export type Corner = 'br' | 'bl' | 'tr' | 'tl'

export type OfficeSize = 's' | 'm' | 'l'

export type OfficeTheme = 'auto' | 'normal' | 'night' | 'party'

export type OfficeLayout = 'horizontal' | 'tower' | 'wings'

/** Flat illustration in Claude's warm colours, or the original pixel art. */
export type OfficeStyle = 'ilustrado' | 'pixel'

export type WhipProfile = 'classic' | 'short' | 'long' | 'flexible'

export type Language = 'es' | 'en'

/**
 * What the corner says when there is nothing to draw: all is set up (and no
 * session is live), Claude Code's folder is missing, or the mod is missing,
 * out of date or turned off.
 */
export type SetupBadge = 'ok' | 'no-claude' | 'no-mod' | 'old-mod' | 'mod-off'

export type OverlayState = {
  isInteractive: boolean
  /** The whip toy: off unless the person turned it on from the tray. */
  isWhipOn: boolean
  language: Language
  setup: SetupBadge
  isOfficeShown: boolean
  officeCorner: Corner
  officeSize: OfficeSize
  officeTheme: OfficeTheme
  officeLayout: OfficeLayout
  officeStyle: OfficeStyle
  /** Fewer things moving: no sparks, no trail, no fidgeting. */
  isCalm: boolean
  whipProfile: WhipProfile
  /** Precision rings to touch with the tip. */
  isTargets: boolean
  /** A crack when someone starts waiting for permission. */
  isAlertSound: boolean
  isMuted: boolean
  volume: number
  anchor: Point | null
  shortcuts: Shortcuts
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

export type SavePatch = Partial<
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
>

/**
 * One live Claude Code session's agents, as the Oficina mod writes them to
 * <Claude Code folder>/oficina-live, checked against the snapshot's schema
 * (electron/snapshot.ts) before they get here.
 */
export type LiveSession = {
  id: string
  label: string
  agents: unknown[]
  boss?: unknown
  usage?: unknown
  cwd?: string
  updatedAt?: number
}

/** What the first-run guide shows: electron/setup.ts's findings, and the commands to type. */
export type SetupView = {
  claudeDir: string
  /** CLAUDE_CONFIG_DIR names the folder. */
  isCustomDir: boolean
  hasClaude: boolean
  mod: 'ok' | 'folder' | 'seen' | 'missing' | 'old' | 'off'
  modVersion: string
  liveSessions: number
  /** What to type in Claude Code for the mod's state; empty when nothing is needed. */
  commands: string[]
  appVersion: string
  language: Language
  options: { isOpenAtLogin: boolean; isUpdateCheck: boolean; isWhipOn: boolean; language: 'auto' | Language }
  shortcuts: Shortcuts
}

export type SetupPatch = Partial<SetupView['options']>
