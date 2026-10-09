// Which bodies the whip's striking end crossed during the last simulation
// step: each point's path from where it was to where it is, so a tip that
// passes clean through a body between two steps still counts.

import type { Box } from './office.ts'

/** What of the whip a strike test reads: its points now and one step ago. */
export type WhipPoints = {
  readonly n: number
  readonly x: ArrayLike<number>
  readonly y: ArrayLike<number>
  readonly px: ArrayLike<number>
  readonly py: ArrayLike<number>
  speedAt: (i: number) => number
}

/** `isTip`: the cracker, the very end of the thong, made it. */
export type Strike = { id: string; speed: number; dir: 1 | -1; x: number; y: number; isTip: boolean }

/** Points from the end that count as the tip. */
const TIP_POINTS = 2

/** The share of the thong, from the tip back, that can strike: all but the thick end by the handle. */
const STRIKING_SHARE = 0.7

/** Whether the segment a→b crosses the box (slab test). */
const crosses = (ax: number, ay: number, bx: number, by: number, box: Box) => {
  let t0 = 0
  let t1 = 1
  const dx = bx - ax
  const dy = by - ay

  for (const [p, d, lo, hi] of [
    [ax, dx, box.x0, box.x1],
    [ay, dy, box.y0, box.y1],
  ] as const) {
    if (Math.abs(d) < 1e-9) {
      if (p < lo || p > hi) return false
      continue
    }

    const a = (lo - p) / d
    const b = (hi - p) / d
    t0 = Math.max(t0, Math.min(a, b))
    t1 = Math.min(t1, Math.max(a, b))

    if (t0 > t1) return false
  }

  return true
}

/** One strike per box, the fastest point that crossed it. */
export const strikes = (whip: WhipPoints, boxes: readonly Box[]): Strike[] => {
  const found: Strike[] = []
  const from = Math.floor(whip.n * (1 - STRIKING_SHARE))

  for (const box of boxes) {
    let best: Strike | null = null

    for (let i = from; i < whip.n; i++) {
      if (!crosses(whip.px[i], whip.py[i], whip.x[i], whip.y[i], box)) continue

      const speed = whip.speedAt(i)

      if (best === null || speed > best.speed) {
        best = {
          id: box.id,
          speed,
          dir: whip.x[i] >= whip.px[i] ? 1 : -1,
          x: whip.x[i],
          y: whip.y[i],
          isTip: i >= whip.n - TIP_POINTS,
        }
      }
    }

    if (best) found.push(best)
  }

  return found
}
