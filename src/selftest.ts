// A scripted hand for `npm run selftest`: holds still, circles slowly, then
// flicks three times. The app runs it through the same path a mouse takes.

export type Phase = 'settle' | 'slow' | 'flick' | 'done'

const SLOW_FROM = 1.2
const SLOW_TO = 4.2
export const FLICKS = [5, 6.2, 7.4]
const END = 11.5
const FLICK_REACH = 420
const FLICK_SECONDS = 0.07

export const phaseAt = (t: number): Phase => {
  if (t >= END) return 'done'
  if (t >= FLICKS[0]) return 'flick'
  if (t >= SLOW_FROM && t < SLOW_TO + 0.6) return 'slow'

  return 'settle'
}

/** Where the hand is at `t` seconds, around `home`. */
export const handAt = (t: number, home: { x: number; y: number }) => {
  if (t >= SLOW_FROM && t < SLOW_TO) {
    const u = t - SLOW_FROM
    // Eased in and out so the circle itself never jerks the whip.
    const r = 120 * Math.min(1, u, SLOW_TO - t)

    return { x: home.x + r * Math.cos(u * 4), y: home.y + r * Math.sin(u * 4) }
  }

  for (const start of FLICKS) {
    const p = (t - start) / FLICK_SECONDS

    if (p > 0 && p < 2) {
      return { x: home.x + FLICK_REACH * (p < 1 ? p : 2 - p), y: home.y }
    }
  }

  return home
}
