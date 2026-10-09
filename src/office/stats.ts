// The whip's tally: hits today, and per agent this month for the "employee
// of the month" (the one who took the most). Kept in the renderer's own
// storage, which survives restarts; nothing leaves the machine.

export type StatsData = {
  /** `YYYY-MM-DD` the day count is for. */
  day: string
  today: number
  criticalsToday: number
  /** `YYYY-MM` the per-agent counts are for. */
  month: string
  byName: Record<string, number>
}

/** Where the counts are kept: `localStorage` in the app, a plain object in a test. */
export type Storage = { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void }

const KEY = 'oficina.stats'

const dayOf = (now: Date) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

const empty = (now: Date): StatsData => ({ day: dayOf(now), today: 0, criticalsToday: 0, month: dayOf(now).slice(0, 7), byName: {} })

export class Stats {
  private data: StatsData
  private readonly storage: Storage | null

  constructor(storage: Storage | null, now = new Date()) {
    this.storage = storage
    this.data = empty(now)

    try {
      const stored = JSON.parse(storage?.getItem(KEY) ?? 'null') as Partial<StatsData> | null

      if (stored && typeof stored === 'object') {
        this.data = { ...this.data, ...stored, byName: { ...(stored.byName ?? {}) } }
      }
    } catch {
      // Unreadable counts start over.
    }

    this.roll(now)
  }

  /** A new day zeroes today's count; a new month, the per-agent counts. */
  private roll(now: Date) {
    const day = dayOf(now)

    if (this.data.day !== day) {
      this.data.day = day
      this.data.today = 0
      this.data.criticalsToday = 0
    }

    if (this.data.month !== day.slice(0, 7)) {
      this.data.month = day.slice(0, 7)
      this.data.byName = {}
    }
  }

  /** One hit landed on the agent called `name`. */
  record(name: string, isCritical: boolean, now = new Date()) {
    this.roll(now)
    this.data.today += 1
    this.data.criticalsToday += isCritical ? 1 : 0
    this.data.byName[name] = (this.data.byName[name] ?? 0) + 1

    try {
      this.storage?.setItem(KEY, JSON.stringify(this.data))
    } catch {
      // Full or blocked storage: the count lives on in memory.
    }
  }

  get today() {
    return this.data.today
  }

  get criticalsToday() {
    return this.data.criticalsToday
  }

  /** How many this month the agent called `name` took. */
  monthOf(name: string) {
    return this.data.byName[name] ?? 0
  }

  /** The employee of the month: whoever took the most, or null before the first hit. */
  employeeOfTheMonth(): { name: string; hits: number } | null {
    let best: { name: string; hits: number } | null = null

    for (const [name, hits] of Object.entries(this.data.byName)) {
      if (best === null || hits > best.hits) best = { name, hits }
    }

    return best
  }
}
