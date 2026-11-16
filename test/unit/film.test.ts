import { describe, expect, test } from 'vitest'

import { CLIP_FPS, Film, fromReplay } from '../../src/film.ts'
import type { FilmFrame } from '../../src/film.ts'

/** The page feeds the film two clocks: the animation's (small, from page load) and the wall's (epoch ms, stamped on frames). */
const frameAt = (wall: number): FilmFrame => ({ t: wall, w: 2, h: 2, px: Uint8Array.from([0, 1, 2, 3]), scale: 6, title: 'x', labels: [], whip: [] })

describe('the film', () => {
  test('the clip keeps the last twelve seconds, not the whole session, however far apart the two clocks are', () => {
    const film = new Film()
    const wallStart = Date.UTC(2026, 10, 16, 12)

    // One hour at 60 fps of animation time, 1.7e12 ms away from the wall clock.
    for (let ms = 0; ms < 60 * 60_000; ms += 1000 / 60) film.record(5000 + ms, () => frameAt(wallStart + ms))

    const frames = film.clipFrames

    expect(frames.length).toBeLessThanOrEqual(Math.ceil(12 * CLIP_FPS) + 1)
    expect(frames.length).toBeGreaterThan(5 * CLIP_FPS)
    expect(frames.at(-1)!.t - frames[0]!.t).toBeLessThanOrEqual(12_000)
  })

  test('a replay whose pixels are not valid base64 is refused, not thrown', () => {
    expect(() => fromReplay({ format: 'latigo-replay', version: 1, fps: 8, frames: [{ t: 1, w: 2, h: 2, px: '***', scale: 6, title: '', labels: [], whip: [] }] })).not.toThrow()
    expect(fromReplay({ format: 'latigo-replay', version: 1, fps: 8, frames: [{ t: 1, w: 2, h: 2, px: '***', scale: 6, title: '', labels: [], whip: [] }] })).toBeNull()
  })
})
