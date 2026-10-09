import assert from 'node:assert/strict'
import { test } from 'node:test'

import { changesOf } from '../electron/changes.ts'
import { SCENE_ID, sceneAt } from '../electron/scenes.ts'
import { fromReplay, toReplay } from '../src/film.ts'
import { setLanguage } from '../src/i18n.ts'
import { Office, roleOf } from '../src/office/office.ts'
import { Props } from '../src/office/props.ts'
import type { LiveSession, OficinaAgent } from '../src/office/types.ts'
import { Targets } from '../src/targets.ts'
import { TrickReader } from '../src/tricks.ts'

const FPS = 60
const NOW = Date.now()

const agent = (id: string, over: Partial<OficinaAgent> = {}): OficinaAgent => ({
  id,
  seenAt: 0,
  isListed: true,
  files: [],
  trail: [],
  seq: 0,
  name: id,
  type: 'general-purpose',
  kind: 'subagent',
  status: 'running',
  activity: 'working',
  detail: '',
  tools: 0,
  startedAt: NOW - 5000,
  endedAt: 0,
  isBackground: false,
  isDemo: false,
  note: '',
  ...over,
})

const settled = (sessions: LiveSession[]) => {
  const office = new Office()
  office.setSessions(sessions)

  for (let frame = 0; frame < 1.5 * FPS; frame++) {
    office.layout(1920, 1040)
    office.step(1 / FPS, Date.now())
  }

  return office
}

// --- The office's work views ---------------------------------------------------------

test('two agents writing the same file are flagged; reading it is not writing it', () => {
  const touch = (path: string, isWrite: boolean) => [{ path, isWrite, at: NOW - 1000 }]
  const office = settled([
    {
      id: 's',
      label: 'repo',
      cwd: 'C:\\repo',
      updatedAt: NOW,
      agents: [
        agent('a', { files: touch('C:\\repo\\src\\app.ts', true) }),
        agent('b', { files: touch('c:/repo/src/app.ts', true) }),
        agent('c', { files: touch('C:/repo/src/app.ts', false) }),
      ],
    },
  ])
  const shared = office.sharedFiles(NOW)

  assert.equal(shared.get('s:a')?.file, 'app.ts')
  assert.ok(shared.has('s:b'))
  assert.equal(shared.has('s:c'), false)
  assert.ok(office.tooltipOf('s:a', NOW).some(line => line.includes('también escribe app.ts')))
  setLanguage('en')
  assert.ok(office.tooltipOf('s:a', NOW).some(line => line.includes('is also writing app.ts')))
  setLanguage('es')
})

test('the folder map counts touches by top folder of the project', () => {
  const at = NOW - 1000
  const office = settled([
    {
      id: 's',
      label: 'repo',
      cwd: 'C:/repo',
      updatedAt: NOW,
      agents: [
        agent('a', { files: [{ path: 'C:/repo/src/a.ts', isWrite: true, at }, { path: 'C:/repo/src/b.ts', isWrite: false, at }, { path: 'C:/repo/README.md', isWrite: false, at }] }),
      ],
    },
  ])

  assert.deepEqual(office.folderMap(NOW), [
    { folder: 'src', count: 2 },
    { folder: '(raíz)', count: 1 },
  ])
})

test('a session that stops writing is shown as disconnected', () => {
  const office = settled([{ id: 's', label: 'repo', updatedAt: NOW - 30_000, agents: [agent('a')] }])

  assert.deepEqual(office.staleSessions(NOW), ['s'])
  assert.ok(office.tooltipOf('s:a', NOW).some(line => line.includes('sin datos nuevos')))
})

test('who spawned whom, and how its tools went, are told', () => {
  const office = settled([
    {
      id: 's',
      label: 'repo',
      updatedAt: NOW,
      boss: { status: 'working', activity: 'working', detail: '', since: NOW },
      agents: [agent('lead'), agent('helper', { parentId: 'lead', trail: ['err', 'err', 'ok'] }), agent('solo')],
    },
  ])

  assert.ok(office.tooltipOf('s:helper', NOW).includes('lo lanzó lead'))
  assert.ok(office.tooltipOf('s:solo', NOW).includes('lo lanzó el jefe'))
  assert.ok(office.tooltipOf('s:helper', NOW).some(line => line.includes('✗ ✗ ✓') && line.includes('la última salió bien')))
})

test('roles keep to their part of the office; layouts change the floor plan', () => {
  assert.equal(roleOf({ type: 'Explore', name: 'x' }), 'explore')
  assert.equal(roleOf({ type: 'general-purpose', name: 'Tester' }), 'test')

  const office = settled([{ id: 's', label: 'r', updatedAt: NOW, agents: [agent('t', { name: 'Tester' }), agent('e', { type: 'Explore' })] }])
  assert.ok(office.actors.get('s:t')!.slot > office.actors.get('s:e')!.slot)

  const wide = office.width
  office.configure('br', 'm', 'normal', 'tower')
  for (let frame = 0; frame < FPS; frame++) {
    office.step(1 / FPS, Date.now())
    office.layout(1920, 1040)
  }
  assert.ok(office.width < wide, 'a tower is narrower')
})

// --- Props and the robot ------------------------------------------------------------------

test('a lashed cup flies, lands, and the robot puts it back', () => {
  const props = new Props()
  props.sync([{ slot: 0, x: 0, feet: 15, isBoss: false }], 120)
  const cup = props.items.get('0:cup')!
  const home = { x: cup.x, y: cup.y }

  assert.ok(props.hit('prop:0:cup', 400, 1))
  for (let frame = 0; frame < 3 * FPS && cup.state !== 'down'; frame++) props.step(1 / FPS)
  assert.equal(cup.state, 'down')
  assert.ok(cup.x !== home.x)

  for (let frame = 0; frame < 20 * FPS && props.robot !== null || frame < 5 * FPS; frame++) props.step(1 / FPS)
  assert.equal(cup.state, 'rest')
  assert.deepEqual({ x: cup.x, y: cup.y }, home)
})

test('a folder spills sheets, which the robot bins', () => {
  const props = new Props()
  props.sync([{ slot: 0, x: 0, feet: 15, isBoss: false }], 120)
  props.hit('prop:0:folder', 400, -1)
  assert.ok([...props.items.values()].some(prop => prop.kind === 'paper'))

  for (let frame = 0; frame < 40 * FPS; frame++) props.step(1 / FPS)
  assert.equal([...props.items.values()].some(prop => prop.kind === 'paper'), false)
})

test('a slow tip hooks a fallen prop; a flick flings it', () => {
  const props = new Props()
  props.sync([{ slot: 0, x: 0, feet: 15, isBoss: false }], 120)
  const pencil = props.items.get('0:pencil')!
  props.hit('prop:0:pencil', 300, 1)
  for (let frame = 0; frame < 3 * FPS && pencil.state !== 'down'; frame++) props.step(1 / FPS)

  props.hook(pencil.x + pencil.w / 2, pencil.y + pencil.h / 2, 0, 0, true)
  assert.equal(pencil.state, 'held')
  props.hook(30, 5, 0, 0, true)
  assert.ok(Math.abs(pencil.x - 29) < 1.5)
  props.hook(30, 5, 400, -200, true)
  assert.equal(pencil.state, 'flying')
})

// --- Tricks and targets -------------------------------------------------------------------

test('a full circle and a double crack-back are read off the tip', () => {
  const circle = new TrickReader()
  let found = null

  for (let k = 0; k <= 70 && !found; k++) {
    const a = (k / 60) * 2 * Math.PI
    found = circle.add(500 + 120 * Math.cos(a), 400 + 120 * Math.sin(a), k / 60)
  }

  assert.equal(found, 'circle')

  const double = new TrickReader()
  const xs = [0, 80, 160, 80, 0, 80, 160, 240]
  let seen = null

  for (const [k, x] of xs.entries()) {
    seen = double.add(500 + x, 400, k / 60) ?? seen
  }

  assert.equal(seen, 'double')
})

test('a ring is touched by the tip passing through it, not near it', () => {
  const targets = new Targets(() => 0.5)
  targets.spawn({ x0: 0, y0: 0, x1: 200, y1: 200 }, 0)
  const ring = targets.target!

  assert.equal(targets.touch(ring.x - 100, ring.y + 40, ring.x + 100, ring.y + 40, 1), null)
  assert.equal(targets.touch(ring.x - 100, ring.y + 5, ring.x + 100, ring.y + 5, 1.5), 1.5)
  assert.equal(targets.streak, 1)
  assert.equal(targets.target, null)
})

// --- Demo scenes ----------------------------------------------------------------------------

test('a demo scene is a labelled, made-up session that never notifies', () => {
  const early = sceneAt('team', 3, NOW)
  const later = sceneAt('team', 30, NOW)

  assert.equal(early.id, SCENE_ID)
  assert.ok(later.agents.length > early.agents.length)
  assert.ok((later.agents as OficinaAgent[]).every(one => one.isDemo))
  assert.ok((later.agents as OficinaAgent[]).some(one => one.status === 'done'))

  const notes = changesOf(changesOf(null, [early]).seen, [later]).notes
  assert.deepEqual(notes, [])
})

test('the rough delivery has someone fail and a boss with a nearly full context', () => {
  const scene = sceneAt('rough', 30, NOW)

  assert.ok((scene.agents as OficinaAgent[]).some(one => one.status === 'failed'))
  assert.ok((scene.usage as { percent: number }).percent >= 80)
})

// --- Film ---------------------------------------------------------------------------------------

test('a replay goes out and comes back as the same frames; anything else is refused', () => {
  const frame = { t: 1, w: 2, h: 2, px: Uint8Array.from([0, 1, 2, 3]), scale: 6, title: 'Oficina', labels: [{ text: 'a', x: 1, y: 2, color: '#F5F0E6', size: 12 }], whip: [1, 2, 3, 4] }
  const back = fromReplay(JSON.parse(JSON.stringify(toReplay([frame]))))

  assert.ok(back)
  assert.deepEqual([...back.frames[0]!.px], [0, 1, 2, 3])
  assert.equal(back.frames[0]!.title, 'Oficina')
  assert.equal(fromReplay({ format: 'otra-cosa' }), null)
  assert.equal(fromReplay({ format: 'latigo-replay', version: 1, frames: [{ w: 2, h: 2, px: 'AA==' }] }), null)
})
