// Achievements for the whip: unlocked once, kept in the renderer's own
// storage across restarts. Nothing here touches an agent.

import type { Storage } from './stats.ts'

export type Achievement = { id: string; title: string; detail: string }

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'first-hit', title: 'Primer golpe', detail: 'Le pegaste a un agentito.' },
  { id: 'first-critical', title: 'Primer crítico', detail: 'La punta le dio de lleno.' },
  { id: 'boss', title: 'Le pegaste al jefe', detail: 'Y sus agentes festejaron.' },
  { id: 'combo-5', title: 'Combo ×5', detail: 'Cinco golpes seguidos.' },
  { id: 'combo-10', title: 'Combo ×10', detail: 'Diez golpes seguidos.' },
  { id: 'triple-critical', title: 'Triple crítico', detail: 'Tres críticos en diez segundos.' },
  { id: 'day-100', title: 'Cien en un día', detail: '100 golpes en un solo día.' },
  { id: 'total-1000', title: 'Mil golpes', detail: '1000 golpes en total.' },
  { id: 'dodged-10', title: 'Escurridizos', detail: 'Te esquivaron 10 veces.' },
]

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
    const fresh = ACHIEVEMENTS.filter(one => ids.includes(one.id) && !this.unlocked.has(one.id))

    for (const one of fresh) this.unlocked.add(one.id)

    return fresh
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
