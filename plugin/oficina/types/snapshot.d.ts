// The live snapshot: the one file each Claude Code session writes for the
// desktop app, at <Claude Code folder>/oficina-live/<session>.json. This is
// the only definition of its shape: the mod writes it and the app imports
// these types (and checks every file it reads against them, dropping what
// does not fit). A change that breaks old readers bumps `schemaVersion`;
// new optional fields do not.

/** The snapshot shape this mod writes. */
export type OficinaSchemaVersion = 1

/** What an agent is observably doing right now, from its own tool calls. */
export type OficinaActivity = 'working' | 'reading' | 'searching' | 'editing' | 'tool' | 'waiting'

/**
 * Where an agent stands. `idle` is a teammate between turns; `unknown` is an
 * agent the mod once saw and can no longer find evidence about.
 */
export type OficinaStatus = 'running' | 'idle' | 'done' | 'failed' | 'unknown'

/** One file an agent's tool touched: what the desktop app's "same file" and folder map read. */
export type OficinaTouch = { path: string; isWrite: boolean; at: number }

/** How one of its tool calls ended. */
export type OficinaOutcome = 'ok' | 'err'

export type OficinaAgent = {
  /** The engine's id for the agent's loop. */
  id: string
  /** Stable per session: what picks the character's accessory and colour. */
  seq: number
  /** What the spawn called it (its name, else its task description). */
  name: string
  /** The agent definition it runs as (`Explore`, `general-purpose`, ...). */
  type: string
  kind: 'subagent' | 'teammate'
  status: OficinaStatus
  activity: OficinaActivity
  /** A few words of evidence for the activity (a file's name, a pattern). */
  detail: string
  /** Tool calls of this agent in flight. */
  tools: number
  /** Epoch ms; 0 when the start was not witnessed (found after a reload). */
  startedAt: number
  /** Epoch ms of the witnessed end; 0 while running. */
  endedAt: number
  /** Epoch ms of the last change in what is known about it: one of its events, or a status the list settled. */
  seenAt: number
  /** The engine's agent list has named it: its absence there is then evidence. */
  isListed: boolean
  isBackground: boolean
  /** Raised by the demo's synthetic events, never by a real agent. */
  isDemo: boolean
  /** Why it failed, when it did (`error`, `refusal`, `aborted`, `killed`). */
  note: string
  /** The agent whose loop spawned it; absent when the session's main loop did. */
  parentId?: string
  /** The files its tools touched lately, the latest last. */
  files: OficinaTouch[]
  /** How its latest tool calls ended, the latest last. */
  trail: OficinaOutcome[]
}

/** The session's own Claude, the main loop: the office's boss. */
export type OficinaBoss = {
  status: 'working' | 'waiting' | 'idle'
  activity: string
  detail: string
  /** Epoch ms of its last status change. */
  since: number
  files: OficinaTouch[]
  trail: OficinaOutcome[]
}

/** A rate-limit window of the account: which (`five_hour`, `seven_day`), how much is used, when it resets. */
export type OficinaLimit = { kind: string; percentUsed: number; resetsAt: string }

/** What the session has spent and how full its context is. */
export type OficinaUsage = { tokens: number; window: number; percent: number; usd: number; limits: OficinaLimit[] }

export type OficinaSnapshot = {
  schemaVersion: OficinaSchemaVersion
  /** The mod's own version (its plugin.json), so the app can say when it is out of date. */
  modVersion: string
  /** The Claude Code session id. */
  session: string
  /** The session folder's last name. */
  label: string
  /** Where the session runs: what the app's folder map is relative to. */
  cwd: string
  /** Epoch ms of the write: a session whose file stops changing is gone. */
  updatedAt: number
  /** Written once as the session ends, so the app drops it at once. */
  isEnded: boolean
  agents: OficinaAgent[]
  boss: OficinaBoss
  /** Null until the engine first answers how much the session has used. */
  usage: OficinaUsage | null
}
