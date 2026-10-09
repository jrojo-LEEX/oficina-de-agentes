import { expect, test } from 'claude-code/testing'

import type { OficinaAgent } from '../types/snapshot'
import { strike } from '../hooks/scene/actors.ts'
import { World } from '../hooks/scene/world.ts'
import type { SceneEvent } from '../hooks/scene/world.ts'

declare const console: { log: (...values: unknown[]) => void }

const FRAME = 0.04

const agent = (id: string, seq: number, over: Partial<OficinaAgent> = {}): OficinaAgent => ({
  id,
  seq,
  name: id,
  type: 'Explore',
  kind: 'subagent',
  status: 'running',
  activity: 'working',
  detail: '',
  tools: 0,
  startedAt: Date.now(),
  endedAt: 0,
  seenAt: Date.now(),
  isListed: true,
  files: [],
  trail: [],
  isBackground: false,
  isDemo: false,
  note: '',
  ...over,
})

/** A scene 100 cells wide, one row of desks, with the given agents seated and settled. */
const office = (agents: OficinaAgent[], isWhipOn = true) => {
  const world = new World()
  world.props = { agents, isWhipOn, isPaused: false }
  world.resize(100, 11)
  run(world, 1.5)

  return world
}

const run = (world: World, seconds: number, each?: (frame: number) => void): SceneEvent[] => {
  const events: SceneEvent[] = []

  for (let frame = 0; frame < seconds / FRAME; frame++) {
    each?.(frame)
    events.push(...world.step(FRAME).events)
  }

  return events
}

/** Presses on the handle, as a hand taking it. */
const grab = (world: World) => {
  world.pointer({ type: 'down', x: Math.floor(world.whip.gripX), y: Math.floor(world.whip.gripY / 2), button: 'left' })
}

const move = (world: World, x: number, y: number) => {
  world.pointer({ type: 'move', x, y, button: 'left' })
}

const isFinite = (world: World) =>
  Array.from(world.whip.x).every(Number.isFinite) && Array.from(world.whip.y).every(Number.isFinite)

test('agents take desks of their own and keep them', async () => {
  const world = office([agent('a', 0), agent('b', 1), agent('c', 2)])

  expect([...world.actors.values()].map(actor => [actor.id, actor.slot])).toEqual([
    ['a', 0],
    ['b', 1],
    ['c', 2],
  ])

  // One leaves; the others stay where they sat, and a newcomer takes the free desk.
  world.props = { ...world.props, agents: [agent('b', 1), agent('c', 2)] }
  run(world, 2)
  expect(world.actors.has('a')).toBe(false)
  world.props = { ...world.props, agents: [agent('b', 1), agent('c', 2), agent('d', 3)] }
  run(world, 1)
  expect(world.actors.get('b')!.slot).toBe(1)
  expect(world.actors.get('c')!.slot).toBe(2)
  expect(world.actors.get('d')!.slot).toBe(0)
})

test('more agents than desks are paged, none dropped', async () => {
  const many = Array.from({ length: 12 }, (_, i) => agent(`a${i}`, i))
  const world = office(many)

  expect(world.capacity).toBe(5)
  expect(world.actors.size).toBe(12)
  expect(world.pages).toBe(3)
})

test('every row drawn is exactly as wide as the region', async () => {
  const world = office([agent('a', 0, { activity: 'reading' }), agent('b', 1, { status: 'unknown' })])
  const rows = world.draw()

  expect(rows).toHaveLength(11)

  for (const runs of rows) {
    expect([...runs.map(one => one.text).join('')]).toHaveLength(100)
  }

  expect(rows.flat().some(one => one.backgroundColor === '#D97757' || one.color === '#D97757')).toBe(true)
})

test('the handle can be grabbed, dragged and let go; it stays where it was left', async () => {
  const world = office([agent('a', 0)])

  grab(world)
  expect(world.isGrabbed).toBe(true)

  move(world, 50, 3)
  run(world, 1)
  expect(Math.abs(world.whip.gripX - 50.5)).toBeLessThan(1.5)

  world.pointer({ type: 'up', x: 50, y: 3, button: 'left' })
  expect(world.isGrabbed).toBe(false)
  run(world, 6)
  expect(Math.abs(world.whip.gripX - 50.5)).toBeLessThan(1.5)
  expect(world.whip.isResting()).toBe(true)
  expect(world.whip.stretch()).toBeLessThan(1.1)
})

test('with the whip put away, a press does not grab it', async () => {
  const world = office([agent('a', 0)], false)

  grab(world)
  expect(world.isGrabbed).toBe(false)
})

test('a press away from the handle picks the whip up right there, hanging still', async () => {
  const world = office([agent('a', 0)])
  const target = world.centreOf('a')!

  // Straight onto the character: the pick-up itself hurts nobody.
  world.pointer({ type: 'down', x: Math.floor(target.x), y: Math.floor(target.y), button: 'left' })
  expect(world.isGrabbed).toBe(true)
  expect(Math.abs(world.whip.gripX - (Math.floor(target.x) + 0.5))).toBeLessThan(1)
  const events = run(world, 0.5)
  expect(events.filter(one => one.k === 'hit')).toEqual([])
  world.pointer({ type: 'up', x: Math.floor(target.x), y: Math.floor(target.y), button: 'left' })
  expect(world.isGrabbed).toBe(false)
})

test('a click that never drags still shows the character, whip in hand or not', async () => {
  for (const isWhipOn of [true, false]) {
    const world = office([agent('a', 0)], isWhipOn)
    const target = world.centreOf('a')!
    const at = { x: Math.floor(target.x), y: Math.floor(target.y) }

    world.pointer({ type: 'down', ...at, button: 'left' })
    world.pointer({ type: 'up', ...at, button: 'left' })
    expect(world.selected).toBe('a')

    // A press that drags is a swing, not a click.
    world.pointer({ type: 'down', ...at, button: 'left' })
    world.pointer({ type: 'move', x: at.x + 3, y: at.y, button: 'left' })
    world.pointer({ type: 'up', x: at.x + 3, y: at.y, button: 'left' })
    expect(world.selected).toBe(isWhipOn ? 'a' : null)
  }
})

test('a release missed while the focus was elsewhere still lets go', async () => {
  const world = office([agent('a', 0)])

  grab(world)
  // The pointer comes back moving with no button held.
  world.pointer({ type: 'move', x: 40, y: 3 })
  expect(world.isGrabbed).toBe(false)
})

test('putting the whip away mid-drag lets go of it', async () => {
  const world = office([agent('a', 0)])

  grab(world)
  world.props = { ...world.props, isWhipOn: false }
  run(world, 0.1)
  expect(world.isGrabbed).toBe(false)
})

test('a slow move bends the whip and cracks nothing', async () => {
  const world = office([])

  grab(world)
  // Carried to the middle first; what is measured is the slow sway after.
  for (let x = 90; x >= 60; x--) run(world, 0.08, () => move(world, x, 2))
  run(world, 2)
  const events = run(world, 5, frame => move(world, 60 + Math.round(12 * Math.sin(frame * 0.12)), 2))

  expect(events).toEqual([])
})

test('a fast flick in the air cracks, and hurts nobody', async () => {
  const world = office([agent('a', 0)])

  grab(world)
  move(world, 80, 1)
  run(world, 1)
  const events = run(world, 2, frame => move(world, frame % 6 < 3 ? 95 : 62, 1))

  console.log(`air flick: ${events.map(event => event.k).join(' ')}`)
  expect(events.filter(event => event.k === 'crack').length).toBeGreaterThan(0)
  expect(events.filter(event => event.k === 'hit')).toEqual([])
  expect(world.actors.get('a')!.reaction).toBeNull()
})

test('whipping one character makes it react, and only it', async () => {
  const world = office([agent('a', 0), agent('b', 1), agent('far', 2), agent('farther', 3)])
  const target = world.centreOf('a')!

  grab(world)
  move(world, Math.round(target.x), 1)
  run(world, 1)
  // Lashes down across the character and back up, over and over.
  const events = run(world, 4, frame => move(world, Math.round(target.x) + (frame % 4 < 2 ? -3 : 3), frame % 8 < 4 ? 6 : 1))
  const struck = new Set(events.filter(event => event.k === 'hit').map(event => (event as { id: string }).id))

  console.log(`lashing a: hit ${[...struck].join(', ')} · ${events.filter(e => e.k === 'hit').map(e => (e as { s: string }).s).join(' ')}`)
  expect(struck.has('a')).toBe(true)
  expect(struck.has('far')).toBe(false)
  expect(struck.has('farther')).toBe(false)
  expect(world.actors.get('farther')!.hits).toEqual([])
})

test('a slow graze across a character does nothing to it', async () => {
  const world = office([agent('a', 0)])
  const target = world.centreOf('a')!

  grab(world)
  move(world, Math.round(target.x) - 14, 1)
  run(world, 3)
  // Drags the hanging thong slowly through the body.
  const events = run(world, 6, frame => move(world, Math.round(target.x) - 14 + Math.floor(frame / 12), 1))

  expect(events.filter(event => event.k === 'hit')).toEqual([])
  expect(world.actors.get('a')!.reaction).toBeNull()
})

test('harder hits get bigger reactions, a flurry makes it cower, and reactions vary', async () => {
  const world = office([agent('a', 0)])
  const actor = world.actors.get('a')!

  expect(strike(actor, 50, 1, 10)).toBeNull()
  expect(strike(actor, 150, 1, 20)).toBe('light')
  // Inside the cooldown: one contact is one hit.
  expect(strike(actor, 900, 1, 20.1)).toBeNull()
  expect(strike(actor, 400, 1, 30)).toBe('medium')
  expect(strike(actor, 900, -1, 40)).toBe('strong')

  const flurry = [50, 50.5, 51, 51.5, 52, 52.5].map(at => strike(actor, 400, 1, at))
  console.log(`flurry: ${flurry.join(' ')}`)
  expect(flurry).toContain('cover')
  expect(new Set(flurry).size).toBeGreaterThan(1)
})

test('a reaction never loses the real finish: it celebrates once the reaction ends', async () => {
  const world = office([agent('a', 0)])
  const actor = world.actors.get('a')!

  strike(actor, 900, 1, world.clock)
  expect(actor.reaction?.kind).toBe('strong')

  // The agent finishes while its character is still on the floor.
  world.props = { ...world.props, agents: [agent('a', 0, { status: 'done', endedAt: Date.now() })] }
  run(world, 0.5)
  expect(actor.reaction).not.toBeNull()
  expect(actor.celebrate).toBe(0)
  expect(actor.owesCelebration).toBe(true)

  run(world, 1.6)
  expect(actor.reaction).toBeNull()
  expect(actor.celebrate).toBeGreaterThan(0)

  // And then it walks out; a finished agent is not seated again.
  run(world, 5)
  expect(world.actors.has('a')).toBe(false)
  run(world, 1)
  expect(world.actors.has('a')).toBe(false)
})

test('hitting a character changes nothing about its agent', async () => {
  const before = agent('a', 0, { activity: 'editing', detail: 'Edit app.ts' })
  const frozen = JSON.stringify(before)
  const world = office([before])

  strike(world.actors.get('a')!, 900, 1, world.clock)
  run(world, 3)
  expect(JSON.stringify(before)).toBe(frozen)
})

test('a state change mid-reaction is what the character returns to', async () => {
  const world = office([agent('a', 0)])
  const actor = world.actors.get('a')!

  strike(actor, 400, 1, world.clock)
  world.props = { ...world.props, agents: [agent('a', 0, { status: 'failed', note: 'error', endedAt: Date.now() })] }
  run(world, 2)
  expect(actor.reaction).toBeNull()
  expect(actor.seen).toBe('failed')
  expect(world.actors.has('a')).toBe(true)
})

test('violent input stays finite and the whip recovers its length', async () => {
  const world = office([agent('a', 0), agent('b', 1)])
  let seed = 7
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296

    return seed / 4294967296
  }

  grab(world)
  run(world, 5, () => move(world, Math.floor(random() * 100), Math.floor(random() * 11)))
  expect(isFinite(world)).toBe(true)

  world.pointer({ type: 'up', x: 0, y: 0, button: 'left' })
  run(world, 8)
  expect(isFinite(world)).toBe(true)
  expect(world.whip.stretch()).toBeLessThan(1.15)
  expect(world.whip.isResting()).toBe(true)
})

test('a resize keeps the scene whole and the whip inside it', async () => {
  const world = office([agent('a', 0), agent('b', 1), agent('c', 2)])

  world.resize(44, 19)
  run(world, 1)
  expect(world.capacity).toBe(4)
  expect(world.draw()).toHaveLength(19)
  expect(world.whip.gripX).toBeLessThan(44)

  world.resize(20, 11)
  run(world, 1)
  expect(world.capacity).toBe(1)
  expect(world.pages).toBe(3)
  expect(world.whip.gripX).toBeLessThan(20)
})

test('paused, the office stops fidgeting but still follows its agents', async () => {
  const world = office([agent('a', 0)])
  world.props = { ...world.props, isPaused: true }
  const before = JSON.stringify(world.draw().slice(0, 9))
  run(world, 1)
  expect(JSON.stringify(world.draw().slice(0, 9))).toBe(before)

  world.props = { ...world.props, agents: [agent('a', 0), agent('b', 1)] }
  run(world, 0.2)
  expect(world.actors.has('b')).toBe(true)
})
