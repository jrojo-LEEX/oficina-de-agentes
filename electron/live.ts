// The live sessions: the snapshot each session's Oficina mod keeps
// rewriting, read every poll. No Electron here, so a test can reach it.

import * as fs from 'node:fs'
import * as path from 'node:path'

import type { LiveSession } from './shared'
import { parseSnapshot } from './snapshot'

/** A session whose file has not been rewritten for this long is gone (the mod beats every few seconds). */
export const LIVE_FRESH_MS = 45_000
/** Files of sessions dead this long are swept away. */
export const LIVE_SWEEP_MS = 24 * 60 * 60 * 1000
/** A snapshot is a few kilobytes: anything this big is not one. */
const MAX_BYTES = 2 * 1024 * 1024
/** More files than this in the folder are not looked at in one poll. */
const MAX_FILES = 500

/**
 * Reads every live session's file the Oficina mod wrote and checks it
 * against the snapshot's schema. A file that will not parse (caught
 * mid-write) or is not a snapshot is skipped this time; nothing here writes
 * but the sweep of files dead for a day.
 */
export const readLive = (dir: string, now: number): LiveSession[] => {
  const sessions: LiveSession[] = []
  let names: string[] = []

  try {
    names = fs.readdirSync(dir).filter(name => name.endsWith('.json'))
  } catch {
    return sessions
  }

  for (const name of names.slice(0, MAX_FILES)) {
    const file = path.join(dir, name)

    try {
      const stat = fs.statSync(file)

      if (!stat.isFile() || stat.size > MAX_BYTES) continue

      const snapshot = parseSnapshot(fs.readFileSync(file, 'utf8'))
      // Not a snapshot: left alone, never swept (the folder may be one the person named).
      if (!snapshot) continue

      const { updatedAt } = snapshot

      // Only a snapshot, by the mod's own file naming, dead for a day is swept.
      if (now - updatedAt > LIVE_SWEEP_MS && /^[\w.-]+\.json$/.test(name)) {
        fs.rmSync(file, { force: true })
        continue
      }

      if (now - updatedAt > LIVE_FRESH_MS || snapshot.isEnded) continue

      sessions.push({
        id: snapshot.session,
        label: snapshot.label,
        agents: snapshot.agents,
        boss: snapshot.boss,
        usage: snapshot.usage ?? null,
        cwd: snapshot.cwd,
        updatedAt: snapshot.updatedAt,
      })
    } catch {
      // Half written: read again on the next poll.
    }
  }

  return sessions.sort((a, b) => a.id.localeCompare(b.id))
}

