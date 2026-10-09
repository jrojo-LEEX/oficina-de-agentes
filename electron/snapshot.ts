// The live snapshots, as they come off disk: written by the Oficina mod in
// another process, so nothing is taken on trust. A file must at least say
// which session it is and carry a list of agents; every other field falls
// back to a default on its own, an agent that does not fit is dropped alone,
// and fields of the future are ignored. The shape itself is defined once, in
// the mod's types (plugin/oficina/types/snapshot.d.ts), and checked here
// against it at compile time. No Electron here, so a test can reach it.

import { z } from 'zod'

import type {
  OficinaAgent,
  OficinaBoss,
  OficinaSnapshot,
  OficinaUsage,
} from '../plugin/oficina/types/snapshot'

/** The newest snapshot shape this app reads. A newer one is read as far as it fits. */
export const SCHEMA_VERSION = 1
/** The oldest mod that writes everything this app shows; older ones get a nudge to update. */
export const MIN_MOD_VERSION = '1.0.0'

const text = (max: number) => z.string().transform(value => value.slice(0, max)).catch('')
const count = z.number().finite().nonnegative().catch(0)
const epoch = z.number().finite().nonnegative().catch(0)

const touch = z.object({ path: z.string().max(1000), isWrite: z.boolean().catch(false), at: epoch })
/** A list where an item that does not fit is dropped, not the whole list. */
const listOf = <T extends z.ZodType>(item: T, max: number) =>
  z
    .array(z.unknown())
    .transform(items => items.flatMap(one => {
      const parsed = item.safeParse(one)

      return parsed.success ? [parsed.data as z.infer<T>] : []
    }).slice(-max))
    .catch([])

const outcome = z.enum(['ok', 'err'])

const agent = z.object({
  id: z.string().min(1).max(200),
  seq: z.number().int().nonnegative().catch(0),
  name: text(200),
  type: text(100),
  kind: z.enum(['subagent', 'teammate']).catch('subagent'),
  status: z.enum(['running', 'idle', 'done', 'failed', 'unknown']).catch('unknown'),
  activity: z.enum(['working', 'reading', 'searching', 'editing', 'tool', 'waiting']).catch('working'),
  detail: text(200),
  tools: count,
  startedAt: epoch,
  endedAt: epoch,
  seenAt: epoch,
  isListed: z.boolean().catch(false),
  isBackground: z.boolean().catch(false),
  isDemo: z.boolean().catch(false),
  note: text(60),
  parentId: z.string().max(200).optional().catch(undefined),
  files: listOf(touch, 16),
  trail: listOf(outcome, 16),
})

const boss = z.object({
  status: z.enum(['working', 'waiting', 'idle']).catch('idle'),
  activity: text(40),
  detail: text(200),
  since: epoch,
  files: listOf(touch, 16),
  trail: listOf(outcome, 16),
})

const limit = z.object({ kind: z.string().max(40), percentUsed: z.number().finite(), resetsAt: z.string().max(60).catch('') })

const usage = z.object({
  tokens: count,
  window: count,
  percent: z.number().finite().catch(0),
  usd: count,
  limits: listOf(limit, 8),
})

export const snapshotSchema = z.object({
  /** Missing in the snapshots of mods from before it existed: read as 0. */
  schemaVersion: z.number().int().nonnegative().catch(0),
  modVersion: text(40),
  session: z.string().min(1).max(200),
  label: text(200),
  cwd: text(1000),
  updatedAt: epoch,
  isEnded: z.boolean().catch(false),
  agents: listOf(agent, 200),
  boss: boss.optional().catch(undefined),
  usage: usage.nullable().optional().catch(null),
})

export type Snapshot = z.infer<typeof snapshotSchema>

// Kept honest: what the mod writes is what this reads.
type Agrees<A, B> = [A] extends [B] ? true : false
const _agent: Agrees<OficinaAgent, z.input<typeof agent>> & Agrees<z.infer<typeof agent>, OficinaAgent> = true
const _boss: Agrees<z.infer<typeof boss>, OficinaBoss> = true
const _usage: Agrees<z.infer<typeof usage>, OficinaUsage> = true
const _snapshot: Agrees<OficinaSnapshot, z.input<typeof snapshotSchema>> = true
void [_agent, _boss, _usage, _snapshot]

/** A snapshot from a file's text, or null when it is not one (half written, or something else). */
export const parseSnapshot = (text: string): Snapshot | null => {
  let raw: unknown

  try {
    raw = JSON.parse(text.replace(/^﻿/, ''))
  } catch {
    return null
  }

  // The old files said the session as `session` too; anything without one is not ours.
  const parsed = snapshotSchema.safeParse(raw)

  return parsed.success && Array.isArray((raw as { agents?: unknown }).agents) ? parsed.data : null
}

/** -1, 0 or 1 as `a` is older than, the same as or newer than `b` (plain x.y.z, missing parts as 0). */
export const compareVersions = (a: string, b: string) => {
  const parts = (value: string) => value.split(/[.+-]/).slice(0, 3).map(part => Number.parseInt(part, 10) || 0)
  const [x, y] = [parts(a), parts(b)]

  for (let i = 0; i < 3; i++) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0)

    if (diff !== 0) return Math.sign(diff)
  }

  return 0
}

/**
 * Whether a snapshot comes from a mod older than this app needs. A mod that
 * could not read its own version says `unknown`: its schema is what counts then.
 */
export const isOldMod = (snapshot: Pick<Snapshot, 'schemaVersion' | 'modVersion'>) =>
  snapshot.schemaVersion < SCHEMA_VERSION || (/^\d/.test(snapshot.modVersion) && compareVersions(snapshot.modVersion, MIN_MOD_VERSION) < 0)
