// Precision targets: a small ring appears in the free space above the
// office, and the tip of the whip has to touch it. A clean touch scores;
// each new ring comes up somewhere else. Nothing captures clicks.

export type Target = { x: number; y: number; r: number; bornAt: number }

export type Area = { x0: number; y0: number; x1: number; y1: number }

/** A ring's radius, in screen pixels. */
const RADIUS = 16

export class Targets {
  target: Target | null = null
  /** Rings touched in a row, and the fastest touch, in seconds. */
  streak = 0
  best = Infinity
  private random: () => number

  constructor(random: () => number = Math.random) {
    this.random = random
  }

  /** Puts a new ring somewhere in `area`, at time `t` (seconds). */
  spawn(area: Area, t: number) {
    const width = Math.max(1, area.x1 - area.x0 - 2 * RADIUS)
    const height = Math.max(1, area.y1 - area.y0 - 2 * RADIUS)
    this.target = { x: area.x0 + RADIUS + this.random() * width, y: area.y0 + RADIUS + this.random() * height, r: RADIUS, bornAt: t }
  }

  clear() {
    this.target = null
    this.streak = 0
  }

  /**
   * The tip moved from (ax, ay) to (bx, by) at time `t`: whether it touched
   * the ring. A touch scores and asks for the next ring; returns the seconds it took.
   */
  touch(ax: number, ay: number, bx: number, by: number, t: number): number | null {
    const ring = this.target

    if (!ring) return null

    // Closest point of the tip's path to the ring's centre.
    const dx = bx - ax
    const dy = by - ay
    const length = dx * dx + dy * dy || 1e-9
    const along = Math.max(0, Math.min(1, ((ring.x - ax) * dx + (ring.y - ay) * dy) / length))
    const distance = Math.hypot(ax + along * dx - ring.x, ay + along * dy - ring.y)

    if (distance > ring.r) return null

    const took = t - ring.bornAt
    this.streak += 1
    this.best = Math.min(this.best, took)
    this.target = null

    return took
  }
}
