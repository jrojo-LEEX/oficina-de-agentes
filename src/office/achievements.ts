// Achievements for the whip: unlocked once, kept in the renderer's own
// storage across restarts. Nothing here touches an agent.

import { t } from '../i18n.ts'
import type { Storage } from './stats.ts'

export type Achievement = { id: string; title: string; detail: string }

/** Every achievement, in order; each one's title and detail are `achievements.<id>.*`. */
export const ACHIEVEMENT_IDS = ['first-hit', 'first-critical', 'boss', 'combo-5', 'combo-10', 'triple-critical', 'day-100', 'total-1000', 'dodged-10'] as const

/** An achievement with its words in the current language. */
export const achievementOf = (id: string): Achievement => ({ id, title: t(`achievements.${id}.title`), detail: t(`achievements.${id}.detail`) })

const KEY = 'oficina.achievements'
const TRIPLE_WINDOW_MS = 10_000

type Saved = { unlocked: string[]; total: number; dodges: number }

export type HitEvent = { isBoss: boolean; isCritical: boolean; combo: number; today: number }

export class Achievements {
  private readonly storage: Storage | null
  private readonly unlocked: Set<string>
  private total = 0
  private dodges = 0
  private criticals: number[] = []

  constructor(storage: Storage | null) {
    this.storage = storage
    let saved: Partial<Saved> = {}

    try {
      saved = (JSON.parse(storage?.getItem(KEY) ?? 'null') as Partial<Saved> | null) ?? {}
    } catch {
      // Unreadable: start over.
    }

    this.unlocked = new Set(Array.isArray(saved.unlocked) ? saved.unlocked : [])
    this.total = typeof saved.total === 'number' ? saved.total : 0
    this.dodges = typeof saved.dodges === 'number' ? saved.dodges : 0
  }

  get count() {
    return this.unlocked.size
  }

  has(id: string) {
    return this.unlocked.has(id)
  }

  private save() {
    try {
      this.storage?.setItem(KEY, JSON.stringify({ unlocked: [...this.unlocked], total: this.total, dodges: this.dodges } satisfies Saved))
    } catch {
      // Blocked storage: they live on in memory.
    }
  }

  /** Unlocks what is now earned and hands back what is new. */
  private unlock(ids: string[]): Achievement[] {
    const fresh = ACHIEVEMENT_IDS.filter(id => ids.includes(id) && !this.unlocked.has(id))

    for (const id of fresh) this.unlocked.add(id)

    return fresh.map(achievementOf)
  }

  /** A hit landed; `now` in ms. */
  onHit(hit: HitEvent, now: number): Achievement[] {
    this.total += 1

    if (hit.isCritical) {
      this.criticals = [...this.criticals.filter(at => now - at < TRIPLE_WINDOW_MS), now]
    }

    const earned = ['first-hit']
    if (hit.isCritical) earned.push('first-critical')
    if (hit.isBoss) earned.push('boss')
    if (hit.combo >= 5) earned.push('combo-5')
    if (hit.combo >= 10) earned.push('combo-10')
    if (this.criticals.length >= 3) earned.push('triple-critical')
    if (hit.today >= 100) earned.push('day-100')
    if (this.total >= 1000) earned.push('total-1000')

    const fresh = this.unlock(earned)
    this.save()

    return fresh
  }

  /** A character ducked out of the way. */
  onDodge(): Achievement[] {
    this.dodges += 1
    const fresh = this.unlock(this.dodges >= 10 ? ['dodged-10'] : [])
    this.save()

    return fresh
  }
}
