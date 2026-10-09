// The agents as the Oficina mod publishes them, one snapshot per Claude Code
// session. Their shapes are defined once, by the mod's contract.

import type { OficinaBoss, OficinaUsage } from '../../plugin/oficina/types/snapshot'

export type {
  OficinaActivity,
  OficinaAgent,
  OficinaOutcome as Outcome,
  OficinaStatus,
  OficinaTouch as Touch,
} from '../../plugin/oficina/types/snapshot'

/** The session's own Claude, the main loop: older snapshots may lack its files and trail. */
export type BossState = Omit<OficinaBoss, 'files' | 'trail'> & Partial<Pick<OficinaBoss, 'files' | 'trail'>>

/** What a session has spent and how full its context is (older snapshots lack the limits). */
export type UsageState = Omit<OficinaUsage, 'limits'> & Partial<Pick<OficinaUsage, 'limits'>>

/** One live session's agents, its boss and its spending, as the main process reads them off disk. */
export type LiveSession = {
  id: string
  label: string
  agents: import('../../plugin/oficina/types/snapshot').OficinaAgent[]
  boss?: BossState
  usage?: UsageState | null
  /** Where the session runs: what the folder map is relative to. */
  cwd?: string
  /** Epoch ms the session last wrote its file: how fresh all of this is. */
  updatedAt?: number
}
