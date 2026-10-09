// The mod's types contract (plugin.json `types`): the state it keeps in
// `$.state`, and the settings and scene types only the mod uses. The engine
// takes a contract only self-contained (no import, no `export ... from`), so
// the agents, their touches, outcomes, activities and statuses are not here:
// ./snapshot.d.ts is their one definition, imported from there by the hooks.

export type OficinaSettings = {
  isWhipOn: boolean
  isExpanded: boolean
  isMuted: boolean
  /** 0 to 1. */
  volume: number
  isPaused: boolean
  isDemo: boolean
}

/**
 * Whether the pane's surface loaded the scene: `waiting` from the pane's
 * opening, `ready` once the office module reported in, `failed` when it had
 * not after a while. `isProbeLoaded` says whether a module with nothing in it
 * loaded there meanwhile, which tells a surface that loads no module apart
 * from one that cannot load the office's.
 */
export type OficinaScene = { status: 'waiting' | 'ready' | 'failed'; since: number; isProbeLoaded: boolean }

/**
 * One agent as the state holds it: an `OficinaAgent` of ./snapshot.d.ts,
 * opaque here because a contract imports nothing; the hooks module reads it
 * through an atom typed with the snapshot's own type.
 */
export type OficinaStoredAgent = Readonly<Record<string, unknown>>

declare module 'claude-code' {
  interface PluginState {
    oficina: { agents: OficinaStoredAgent[]; settings: OficinaSettings; audioNote: string; scene: OficinaScene }
  }
}
