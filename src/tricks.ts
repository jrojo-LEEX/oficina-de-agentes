// Tricks with the whip, read off the path of its tip: a full circle, a
// figure eight, a double crack-back. Pure geometry over the last second
// and a half; nothing learned, nothing sent anywhere.

export type Trick = 'circle' | 'eight' | 'double'

export const TRICK_NAMES: Record<Trick, string> = {
  circle: '¡Vuelta completa!',
  eight: '¡Ocho!',
  double: '¡Doble latigazo!',
}

type Sample = { x: number; y: number; t: number }

/** Seconds of tip path looked at. */
const WINDOW = 1.5
/** A loop must be at least this wide, in screen pixels, to count. */
const MIN_RADIUS = 70
/** Horizontal reversals this fast, in pixels a second, make a double. */
const DOUBLE_SPEED = 2600
const DOUBLE_WINDOW = 0.55
/** Seconds before the same trick can be read again. */
const COOLDOWN = 1.6

export class TrickReader {
  private samples: Sample[] = []
  private last: Partial<Record<Trick, number>> = {}

  /** One position of the tip at time `t` (seconds). Returns a trick when one just completed. */
  add(x: number, y: number, t: number): Trick | null {
    this.samples.push({ x, y, t })
    this.samples = this.samples.filter(one => t - one.t <= WINDOW)

    const found = this.read(t)

    if (found && t - (this.last[found] ?? -Infinity) >= COOLDOWN) {
      this.last[found] = t
      // A trick read once is spent: the path starts over.
      this.samples = this.samples.slice(-1)

      return found
    }

    return null
  }

  reset() {
    this.samples = []
  }

  private read(t: number): Trick | null {
    const s = this.samples

    if (s.length < 8) return null

    // How far the path turned around its own middle, and how wide it was.
    const cx = s.reduce((sum, one) => sum + one.x, 0) / s.length
    const cy = s.reduce((sum, one) => sum + one.y, 0) / s.length
    const radius = s.reduce((sum, one) => sum + Math.hypot(one.x - cx, one.y - cy), 0) / s.length
    let turn = 0
    let most = 0
    let least = 0

    for (let i = 1; i < s.length; i++) {
      const a = Math.atan2(s[i - 1]!.y - cy, s[i - 1]!.x - cx)
      const b = Math.atan2(s[i]!.y - cy, s[i]!.x - cx)
      let d = b - a

      while (d > Math.PI) d -= 2 * Math.PI
      while (d < -Math.PI) d += 2 * Math.PI

      turn += d
      most = Math.max(most, turn)
      least = Math.min(least, turn)
    }

    if (radius >= MIN_RADIUS) {
      // An eight turns one way a full loop and back the other.
      if (most >= 1.6 * Math.PI && least <= -0.4 * Math.PI && most - least >= 3.4 * Math.PI) return 'eight'
      if (Math.abs(turn) >= 2 * Math.PI) return 'circle'
    }

    // A double: the tip reverses sideways twice, fast, in a blink.
    const recent = s.filter(one => t - one.t <= DOUBLE_WINDOW)
    let reversals = 0
    let lastSign = 0

    for (let i = 1; i < recent.length; i++) {
      const dt = recent[i]!.t - recent[i - 1]!.t || 1e-3
      const vx = (recent[i]!.x - recent[i - 1]!.x) / dt

      if (Math.abs(vx) < DOUBLE_SPEED) continue

      const sign = Math.sign(vx)

      if (lastSign !== 0 && sign !== lastSign) reversals += 1
      lastSign = sign
    }

    return reversals >= 2 ? 'double' : null
  }
}
