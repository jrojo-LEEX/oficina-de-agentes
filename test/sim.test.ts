import assert from 'node:assert/strict'
import { test } from 'node:test'

import { CrackDetector } from '../src/crack.ts'
import { Whip, WHIP } from '../src/sim.ts'

type Path = (t: number) => { x: number; y: number }

const HOME = { x: 800, y: 300 }

/** Drives the grip along `path` at a display's frame rate and reports. */
const run = (path: Path, seconds: number, fps = 60, whip = new Whip(HOME.x, HOME.y)) => {
  const detector = new CrackDetector()
  const cracks: number[] = []
  let peakTip = 0
  let worstStretch = 0
  let time = 0

  for (let frame = 0; frame < seconds * fps; frame++) {
    time += 1 / fps
    const at = path(time)
    whip.setTarget(at.x, at.y)
    whip.advance(1 / fps, h => {
      const speed = whip.tipSpeed()
      peakTip = Math.max(peakTip, speed)

      if (detector.update(speed, h)) {
        cracks.push(time)
      }
    })
    worstStretch = Math.max(worstStretch, whip.stretch())
  }

  return { whip, cracks, peakTip, worstStretch }
}

const isWhole = (whip: Whip) =>
  Array.from(whip.x).every(Number.isFinite) && Array.from(whip.y).every(Number.isFinite)

/** A 120 px circle twice a second (a hand at about 480 px/s), eased in. */
const slowCircle: Path = t => {
  const r = 120 * Math.min(1, t)

  return { x: HOME.x + r * Math.cos(t * 4), y: HOME.y + r * Math.sin(t * 4) }
}

/** A flick: out `reach` px and back, each way in `ms`, starting at `start`. */
const flick = (start: number, reach: number, ms: number): Path => t => {
  const p = (t - start) / (ms / 1000)
  const out = p <= 0 ? 0 : p < 1 ? p : p < 2 ? 2 - p : 0

  return { x: HOME.x + reach * out, y: HOME.y }
}

test('hangs still: no crack, no stretch, comes to rest', () => {
  const { whip, cracks, worstStretch } = run(() => HOME, 6)

  assert.equal(cracks.length, 0)
  assert.ok(worstStretch < 1.15, `stretch ${worstStretch} while settling`)
  assert.ok(whip.stretch() < 1.03, `stretch ${whip.stretch()} at rest`)
  assert.ok(whip.isResting(), 'still moving after 6 s')
})

test('a slow move bends the whip without cracking', () => {
  const { cracks, peakTip } = run(slowCircle, 6)

  console.log(`slow circle: peak tip ${Math.round(peakTip)} px/s`)
  assert.equal(cracks.length, 0)
})

test('a slow drag across the screen does not crack', () => {
  const { cracks, peakTip } = run(
    t => ({ x: HOME.x + 500 * Math.sin(t * 1.2), y: HOME.y + 150 * Math.sin(t * 0.7) }),
    8,
  )

  console.log(`slow drag: peak tip ${Math.round(peakTip)} px/s`)
  assert.equal(cracks.length, 0)
})

test('a fast flick cracks, and one gesture does not machine-gun', () => {
  const { cracks, peakTip } = run(flick(1, 420, 70), 3)

  console.log(`flick: peak tip ${Math.round(peakTip)} px/s, cracks at ${cracks.map(c => c.toFixed(2))}`)
  assert.ok(cracks.length >= 1, 'no crack')
  assert.ok(cracks.length <= 3, `${cracks.length} cracks from one flick`)
  assert.ok(cracks[0] > 1 && cracks[0] < 1.6, `first crack at ${cracks[0]}`)

  for (let i = 1; i < cracks.length; i++) {
    assert.ok(cracks[i] - cracks[i - 1] >= 0.22, 'cracks closer than the minimum interval')
  }
})

test('the tip answers after the handle', () => {
  const whip = new Whip(HOME.x, HOME.y)
  run(() => HOME, 3, 60, whip)
  const path = flick(0.1, 300, 60)
  const MOVING = 1500
  let rootAt = 0
  let tipAt = 0
  let rootPeak = 0
  let tipPeak = 0
  let time = 0

  for (let frame = 1; frame <= 60; frame++) {
    const at = path(frame / 60)
    whip.setTarget(at.x, at.y)
    whip.advance(1 / 60, h => {
      // Timed per simulation step: the lag is shorter than a frame.
      time += h
      const root = whip.speedAt(0)
      const tip = whip.tipSpeed()

      if (rootAt === 0 && root > MOVING) rootAt = time
      if (tipAt === 0 && tip > MOVING) tipAt = time
      rootPeak = Math.max(rootPeak, root)
      tipPeak = Math.max(tipPeak, tip)
    })
  }

  console.log(`root moves at ${rootAt.toFixed(3)} s, tip at ${tipAt.toFixed(3)} s`)
  assert.ok(rootAt > 0 && tipAt > rootAt + 0.02, 'the tip did not lag the handle')
  assert.ok(tipPeak > rootPeak, 'tip no faster than the handle')
})

test('violent input stays finite and recovers its length', () => {
  let seed = 12345
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296

    return seed / 4294967296
  }
  // The grip teleports anywhere on a 4K screen every single frame.
  const whip = new Whip(HOME.x, HOME.y)
  const wild = run(() => ({ x: random() * 3840, y: random() * 2160 }), 5, 60, whip)

  assert.ok(isWhole(whip), 'NaN or Infinity in the chain')
  assert.ok(wild.worstStretch < 4, `stretch ${wild.worstStretch} while thrashing`)

  const calm = run(() => HOME, 6, 60, whip)

  assert.ok(isWhole(whip))
  assert.ok(whip.stretch() < 1.05, `stretch ${whip.stretch()} after settling`)
  assert.ok(whip.isResting(), 'did not settle')
  void calm
})

test('a pause or a lost focus is not replayed as one giant step', () => {
  const whip = new Whip(HOME.x, HOME.y)
  run(() => HOME, 3, 60, whip)
  const steps = whip.advance(30)

  assert.ok(steps <= 16, `${steps} steps for one frame`)
  assert.ok(isWhole(whip))
  assert.ok(whip.stretch() < 1.05)
})

test('behaves the same at 60 and 165 Hz displays', () => {
  assert.equal(run(slowCircle, 4, 165).cracks.length, 0)
  assert.ok(run(flick(1, 420, 70), 3, 165).cracks.length >= 1)
  assert.equal(WHIP.stepHz, 240)
})

test('report: tip speed by hand speed', () => {
  for (const [reach, ms] of [[300, 400], [300, 200], [300, 120], [400, 90], [420, 70], [600, 60]]) {
    const { cracks, peakTip } = run(flick(1, reach, ms), 3)
    const hand = Math.round(reach / (ms / 1000))

    console.log(`hand ${hand} px/s: tip ${Math.round(peakTip)} px/s, ${cracks.length} crack(s)`)
  }
})
