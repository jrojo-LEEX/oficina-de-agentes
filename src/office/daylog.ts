// The day's report: every real agent seen today, who it was, how long it
// worked and how it ended. Kept in the renderer's own storage; a new day
// starts it over.

import type { Storage } from './stats.ts'
import type { OficinaAgent } from './types.ts'

export type DayEntry = {
  key: string
  name: string
  type: string
  session: string
  /** Epoch ms; 0 when its start was not seen. */
  startedAt: number
  /** Epoch ms of its end; 0 while it works. */
  endedAt: number
  /** Epoch ms it was last seen. */
  seenAt: number
  status: OficinaAgent['status']
  note: string
}

const KEY = 'oficina.daylog'
/** The most entries a day keeps: the oldest go first. */
const MAX = 300

const dayOf = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export class DayLog {
  private readonly storage: Storage | null
  private day: string
  private byKey = new Map<string, DayEntry>()

  constructor(storage: Storage | null, now = new Date()) {
    this.storage = storage
    this.day = dayOf(now)

    try {
      const saved = JSON.parse(storage?.getItem(KEY) ?? 'null') as { day?: string; entries?: DayEntry[] } | null

      if (saved?.day === this.day && Array.isArray(saved.entries)) {
        for (const entry of saved.entries) this.byKey.set(entry.key, entry)
      }
    } catch {
      // Unreadable: the day starts over.
    }
  }

  /** Takes in the agents as they stand now; `sessionOf` names each one's session. */
  update(agents: (OficinaAgent & { key: string; session: string })[], now = new Date()) {
    const day = dayOf(now)

    if (day !== this.day) {
      this.day = day
      this.byKey.clear()
    }

    let isChanged = false

    for (const agent of agents) {
      const old = this.byKey.get(agent.key)
      const entry: DayEntry = {
        key: agent.key,
        name: agent.name || agent.type || 'agente',
        type: agent.type,
        session: agent.session,
        startedAt: agent.startedAt || old?.startedAt || 0,
        endedAt: agent.endedAt,
        seenAt: now.getTime(),
        status: agent.status,
        note: agent.note,
      }

      if (!old || old.status !== entry.status || old.endedAt !== entry.endedAt || old.name !== entry.name) {
        isChanged = true
      }

      this.byKey.set(agent.key, { ...entry, seenAt: isChanged ? entry.seenAt : (old?.seenAt ?? entry.seenAt) })
    }

    if (this.byKey.size > MAX) {
      const oldest = [...this.byKey.values()].sort((a, b) => a.seenAt - b.seenAt).slice(0, this.byKey.size - MAX)
      for (const entry of oldest) this.byKey.delete(entry.key)
      isChanged = true
    }

    if (isChanged) this.save()

    return isChanged
  }

  private save() {
    try {
      this.storage?.setItem(KEY, JSON.stringify({ day: this.day, entries: [...this.byKey.values()] }))
    } catch {
      // Blocked storage: the day lives on in memory.
    }
  }

  /** The day's agents, the most recent first. */
  entries(): DayEntry[] {
    return [...this.byKey.values()].sort((a, b) => (b.startedAt || b.seenAt) - (a.startedAt || a.seenAt))
  }

  /** How many worked today, how many finished, how many failed, and the time they put in. */
  totals(now = Date.now()) {
    const entries = this.entries()

    return {
      agents: entries.length,
      done: entries.filter(entry => entry.status === 'done').length,
      failed: entries.filter(entry => entry.status === 'failed').length,
      seconds: entries.reduce(
        (sum, entry) => sum + (entry.startedAt ? Math.max(0, ((entry.endedAt || (entry.status === 'running' || entry.status === 'idle' ? now : entry.seenAt)) - entry.startedAt) / 1000) : 0),
        0,
      ),
    }
  }
}
