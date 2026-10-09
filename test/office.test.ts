import assert from 'node:assert/strict'
import { test } from 'node:test'

import { setLanguage } from '../src/i18n.ts'
import { strikes } from '../src/office/hits.ts'
import { COLS, Office, SCALES } from '../src/office/office.ts'
import { Achievements } from '../src/office/achievements.ts'
import { DayLog } from '../src/office/daylog.ts'
import { lookOf, themeAt } from '../src/office/office.ts'
import { Stats } from '../src/office/stats.ts'
import { changesOf } from '../electron/changes.ts'
import type { BossState, LiveSession, OficinaAgent } from '../src/office/types.ts'
import { Whip } from '../src/sim.ts'

const SCREEN = { width: 1920, height: 1040 }
const FPS = 60

const agent = (id: string, seq: number, over: Partial<OficinaAgent> = {}): OficinaAgent => ({
  id,
  seenAt: 0,
  isListed: true,
  files: [],
  trail: [],
  seq,
  name: id,
  type: 'Explore',
  kind: 'subagent',
  status: 'running',
  activity: 'working',
  detail: '',
  tools: 0,
  startedAt: Date.now() - 5000,
  endedAt: 0,
  isBackground: false,
  isDemo: false,
  note: '',
  ...over,
})

const session = (agents: OficinaAgent[], id = 's1', boss?: BossState): LiveSession => ({ id, label: 'repo', agents, boss })

/** Counts kept in a plain object, as the renderer keeps them in its storage. */
const memory = () => {
  const items = new Map<string, string>()

  return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value) }
}

/** An office laid out on a 1920 by 1040 screen, its agents seated and settled. */
const officeWith = (sessions: LiveSession[], stats: Stats | null = null) => {
  const office = new Office(stats)
  office.setSessions(sessions)

  for (let frame = 0; frame < 1.5 * FPS; frame++) {
    office.layout(SCREEN.width, SCREEN.height)
    office.step(1 / FPS, Date.now())
  }

  return office
}

/**
 * Lashes the real whip down onto a body, the hand going up and down above
 * it: what a person does to hit one. Returns every reaction, by character.
 */
const lash = (office: Office, target: string, swing: number, seconds = 3) => {
  const box = office.boxes().find(one => one.id === target)!
  const cx = (box.x0 + box.x1) / 2
  const grip = { x: cx, y: box.y0 - 400 }
  const whip = new Whip(grip.x, grip.y)
  const hits: Record<string, string[]> = {}

  for (let frame = 0; frame < seconds * FPS; frame++) {
    const phase = Math.floor(frame / 8) % 2 === 0 ? -1 : 1
    whip.setTarget(grip.x, grip.y + phase * swing)
    const bodies = office.boxes()
    whip.advance(1 / FPS, () => {
      for (const hit of strikes(whip, bodies)) {
        const kind = office.hit(hit.id, hit.speed, hit.dir)

        if (kind) (hits[hit.id] ??= []).push(kind)
      }
    })
    office.layout(SCREEN.width, SCREEN.height)
    office.step(1 / FPS, Date.now())
  }

  return hits
}

test('every live agent of every session gets a desk in the bottom right corner', () => {
  const office = officeWith([session([agent('a', 0), agent('b', 1)]), session([agent('a', 0)], 's2')])

  assert.equal(office.actors.size, 3)
  assert.ok(office.x + office.width <= SCREEN.width && office.x > SCREEN.width / 2)
  assert.ok(office.y + office.height <= SCREEN.height && office.y > SCREEN.height / 2)

  // Bodies are where the desks are, at the scale they are drawn.
  for (const box of office.boxes()) {
    assert.ok(box.x0 >= office.x && box.x1 <= office.x + office.width)
    assert.ok(box.x1 - box.x0 >= 6 * office.scale)
  }
})

test('no agents, no office on screen; anything without an id is ignored', () => {
  const office = officeWith([session([{ nonsense: true } as unknown as OficinaAgent])])

  assert.equal(office.isShown, false)
  assert.equal(office.actors.size, 0)
})

test('the whip lashed down onto a character makes it react; the long thong may catch its neighbours', () => {
  const office = officeWith([session([agent('a', 0), agent('b', 1), agent('c', 2)])])
  const hits = lash(office, 's1:a', 160)

  console.log('lash:', JSON.stringify(hits))
  assert.ok((hits['s1:a'] ?? []).length > 0, 'the character under the whip reacts')
  // Every reaction is one the characters know, a duck out of the way included.
  assert.ok(Object.values(hits).flat().every(kind => ['light', 'medium', 'strong', 'cover', 'dodge'].includes(kind)))
})

test('a slow sway over a character does nothing to it', () => {
  const office = officeWith([session([agent('a', 0)])])
  const hits = lash(office, 's1:a', 14)

  assert.deepEqual(hits, {})
})

test('hitting a character leaves its agent as it was', () => {
  const agents = [agent('a', 0)]
  const before = JSON.stringify(agents)
  const office = officeWith([session(agents)])
  lash(office, 's1:a', 160)

  assert.equal(JSON.stringify(agents), before)
})

test('a finished agent celebrates and walks out; the pixels paint without throwing', () => {
  const office = officeWith([session([agent('a', 0)])])
  office.paint(false)
  assert.ok(office.pixels.width > 0)

  office.setSessions([session([agent('a', 0, { status: 'done', endedAt: Date.now() })])])

  for (let frame = 0; frame < 5 * FPS; frame++) {
    office.step(1 / FPS, Date.now())
  }

  assert.equal(office.actors.size, 0)
})

const boss = (status: BossState['status'], activity = 'working'): BossState => ({ status, activity, detail: '', since: Date.now() - 1000 })

test("the session's own Claude is the boss: first, at a double desk, and stays while its session lives", () => {
  const office = officeWith([session([agent('a', 0)], 's1', boss('working'))])
  const bossActor = office.actors.get('s1:boss')!

  assert.ok(bossActor, 'the boss is seated')
  assert.equal(bossActor.slot, 0)
  assert.equal(office.actors.get('s1:a')!.slot, 2, 'the agent sits past the double desk')

  // Waiting for the person between turns: it stays, asleep at its desk.
  office.setSessions([session([agent('a', 0)], 's1', boss('idle'))])

  for (let frame = 0; frame < 5 * FPS; frame++) office.step(1 / FPS, Date.now())
  assert.ok(office.actors.has('s1:boss'))
  assert.deepEqual(office.tooltipOf('s1:boss', Date.now()).slice(0, 2), ['Claude · repo', 'Claude principal · te espera'])

  // Its session gone: it walks out.
  office.setSessions([])

  for (let frame = 0; frame < 5 * FPS; frame++) office.step(1 / FPS, Date.now())
  assert.equal(office.actors.size, 0)
})

test('a boss never takes the last desk of a row: its double desk stays in one row', () => {
  const agents = Array.from({ length: COLS - 1 }, (_, i) => agent(`x${i}`, i, { startedAt: 1 + i }))
  const office = officeWith([session(agents, 's1'), session([], 's2', boss('working'))])
  const slot = office.actors.get('s2:boss')!.slot

  assert.ok(slot % COLS !== COLS - 1)
})

test('many live sessions never keep the agents out: the office grows a row, idle bosses sit last', () => {
  // Seven sessions, as on a busy day: their bosses alone would fill the usual twelve desks.
  const team = Array.from({ length: 6 }, (_, i) => agent(`t${i}`, i, { type: i % 2 ? 'code-reviewer' : 'app-builder', startedAt: 10 + i }))
  const sessions = [
    session(team, 's1', boss('idle')),
    session([agent('u0', 0), agent('u1', 1)], 's2', boss('working')),
    ...Array.from({ length: 5 }, (_, i) => session([], `q${i}`, boss(i < 2 ? 'working' : 'idle'))),
  ]
  const office = officeWith(sessions)

  for (const one of [...team.map(a => `s1:${a.id}`), 's2:u0', 's2:u1']) {
    assert.ok(office.actors.has(one), `${one} has a desk`)
  }

  assert.ok(office.actors.has('s1:boss') && office.actors.has('s2:boss'), 'the bosses of working teams are there')
  assert.ok(office.y >= 0 && office.y + office.height <= SCREEN.height, 'the grown office still fits the screen')
})

test('agents that arrive at a full office get a desk: idle bosses step out for them', () => {
  // Bosses of sessions waiting on the person, seated first, filling every desk.
  const idle = Array.from({ length: 18 }, (_, i) => session([], `s${i}`, boss('idle')))
  const office = officeWith(idle)
  assert.equal(office.actors.size, 18)

  // Then a session gets to work with two agents.
  const busy = [session([agent('a', 0), agent('b', 1)], 's0', boss('idle')), ...idle.slice(1)]
  office.setSessions(busy)

  for (let frame = 0; frame < 6 * FPS; frame++) {
    office.layout(SCREEN.width, SCREEN.height)
    office.step(1 / FPS, Date.now())
  }

  assert.ok(office.actors.has('s0:a') && office.actors.has('s0:b'), 'both agents have a desk')
  assert.ok(office.actors.has('s0:boss'), 'their own boss keeps its desk')
  assert.equal(office.hall, 0, 'nobody working waits in the hall')
})

test('the office is illustrated unless pixel art is chosen, and a change of style keeps everyone at their desk', () => {
  const office = officeWith([session([agent('a', 0)], 's1', boss('working'))])
  assert.equal(office.style, 'ilustrado')

  const before = office.boxes().map(box => box.id)
  office.configure('br', 'm', 'auto', 'horizontal', false, 'pixel')
  assert.equal(office.style, 'pixel')
  assert.deepEqual(office.boxes().map(box => box.id), before)

  // Leaving the style out keeps the one in use.
  office.configure('br', 'l')
  assert.equal(office.style, 'pixel')
})

test('pointing at a character names it and says what it does', () => {
  const office = officeWith([session([agent('a', 0, { activity: 'reading', detail: 'Read app.ts' })])])
  const box = office.boxes().find(one => one.id === 's1:a')!

  assert.equal(office.actorAt((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2), 's1:a')
  assert.equal(office.actorAt(1, 1), null)
  assert.deepEqual(office.tooltipOf('s1:a', Date.now()).slice(0, 3), ['a', 'Explore · leyendo', 'Read app.ts'])

  // The same card in English, then back to the default.
  setLanguage('en')
  assert.deepEqual(office.tooltipOf('s1:a', Date.now()).slice(0, 2), ['a', 'Explore · reading'])
  setLanguage('es')
})

test('someone waiting for permission makes the office say so', () => {
  const office = officeWith([session([agent('a', 0)])])
  assert.equal(office.isAnyoneWaiting, false)

  office.setSessions([session([agent('a', 0, { activity: 'waiting' })])])
  assert.equal(office.isAnyoneWaiting, true)
})

test('a critical flings farther than the hardest plain hit, with more stars', () => {
  const fling = (isCritical: boolean) => {
    const office = officeWith([session([agent('a', 0)])])
    const before = office.boxes().find(one => one.id === 's1:a')!
    assert.equal(office.hit('s1:a', 9000, 1, isCritical), 'strong')
    let far = 0

    for (let frame = 0; frame < 2 * FPS; frame++) {
      office.step(1 / FPS, Date.now())
      const now = office.boxes().find(one => one.id === 's1:a')!
      far = Math.max(far, Math.abs(now.x0 - before.x0))
    }

    return far
  }

  assert.ok(fling(true) > fling(false))
})

test('the office goes to the corner and size asked for', () => {
  const office = officeWith([session([agent('a', 0)])])
  office.configure('tl', 'l')
  office.layout(SCREEN.width, SCREEN.height)

  assert.equal(office.scale, SCALES.l)
  assert.ok(office.x < SCREEN.width / 4 && office.y < SCREEN.height / 4)
})

test('hits are counted for today and the month; the employee of the month took the most', () => {
  const storage = memory()
  // Hits are stamped with the real clock, so the days here are counted from today.
  const today = new Date()
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1)
  const stats = new Stats(storage, today)
  const office = officeWith([session([agent('a', 0, { name: 'Explorador' }), agent('b', 1, { name: 'Revisor' })])], stats)

  office.hit('s1:a', 2000, 1)
  office.clock += 1
  office.hit('s1:a', 2000, 1, true)
  office.clock += 1
  office.hit('s1:b', 2000, 1)

  assert.equal(stats.today, 3)
  assert.equal(stats.criticalsToday, 1)
  assert.deepEqual(stats.employeeOfTheMonth(), { name: 'Explorador', hits: 2 })

  // Kept across restarts; a new day starts today's count over, a new month the ranking.
  assert.equal(new Stats(storage, today).today, 3)
  assert.equal(new Stats(storage, tomorrow).today, 0)
  assert.equal(new Stats(storage, nextMonth).employeeOfTheMonth(), null)
})

test('a slow whip is seen coming and dodged: no hit, no count', () => {
  const stats = new Stats(memory())
  const office = officeWith([session([agent('a', 0)])], stats)

  assert.equal(office.hit('s1:a', 700, 1), 'dodge')
  assert.equal(stats.today, 0)
  // Slower still, it goes unnoticed.
  office.clock += 2
  for (let frame = 0; frame < FPS; frame++) office.step(1 / FPS, Date.now())
  assert.equal(office.hit('s1:a', 200, 1), null)
})

test('hit the boss and its agents cheer; hit an agent and the next desk laughs', () => {
  const office = officeWith([session([agent('a', 0, { startedAt: 1 }), agent('b', 1, { startedAt: 2 })], 's1', boss('working'))])

  office.hit('s1:boss', 3000, 1)
  assert.equal(office.actors.get('s1:a')!.gleeKind, 'cheer')
  assert.ok(office.actors.get('s1:a')!.glee > 0)

  for (let frame = 0; frame < 3 * FPS; frame++) office.step(1 / FPS, Date.now())
  office.hit('s1:b', 3000, 1)
  assert.equal(office.actors.get('s1:a')!.gleeKind, 'laugh')
})

test('each kind of agent wears its own thing; the boss sweats when its context is nearly full', () => {
  assert.equal(lookOf({ type: 'Explore', name: 'x' }), 'explorer')
  assert.equal(lookOf({ type: 'Plan', name: 'x' }), 'plans')
  assert.equal(lookOf({ type: 'general-purpose', name: 'Revisor' }), 'glasses')
  assert.equal(lookOf({ type: 'general-purpose', name: 'x' }), null)

  const full = { ...session([], 's1', boss('working')), usage: { tokens: 170_000, window: 200_000, percent: 85, usd: 2.5 } }
  const office = officeWith([full])
  const lines = office.tooltipOf('s1:boss', Date.now())

  assert.ok(lines.some(line => line.includes('contexto 85%') && line.includes('US$ 2,50') && line.includes('casi lleno')))
})

test('the theme follows the clock: night late, party on Fridays, as chosen otherwise', () => {
  assert.equal(themeAt('auto', new Date(2026, 9, 1, 22)), 'night')
  assert.equal(themeAt('auto', new Date(2026, 9, 2, 15)), 'party')
  assert.equal(themeAt('auto', new Date(2026, 9, 1, 15)), 'normal')
  assert.equal(themeAt('night', new Date(2026, 9, 1, 15)), 'night')
})

test('achievements unlock once, and are kept', () => {
  const storage = memory()
  const list = new Achievements(storage)

  assert.deepEqual(list.onHit({ isBoss: false, isCritical: false, combo: 1, today: 1 }, 0).map(one => one.id), ['first-hit'])
  assert.deepEqual(list.onHit({ isBoss: false, isCritical: false, combo: 2, today: 2 }, 100), [])
  const crits = [1000, 2000, 3000].flatMap(at => list.onHit({ isBoss: true, isCritical: true, combo: 5, today: 5 }, at).map(one => one.id))

  assert.ok(crits.includes('first-critical') && crits.includes('boss') && crits.includes('combo-5') && crits.includes('triple-critical'))
  assert.equal(new Achievements(storage).has('triple-critical'), true)
})

test('the day report keeps every real agent of the day and starts over the next', () => {
  const storage = memory()
  const log = new DayLog(storage, new Date(2026, 9, 2, 10))
  const seated = (over: Partial<OficinaAgent>) => ({ ...agent('a', 0, over), key: 's1:a', session: 'repo' })

  log.update([seated({ startedAt: new Date(2026, 9, 2, 10).getTime() })], new Date(2026, 9, 2, 10, 1))
  log.update([seated({ status: 'done', startedAt: new Date(2026, 9, 2, 10).getTime(), endedAt: new Date(2026, 9, 2, 10, 5).getTime() })], new Date(2026, 9, 2, 10, 6))

  assert.deepEqual(log.totals(new Date(2026, 9, 2, 11).getTime()), { agents: 1, done: 1, failed: 0, seconds: 300 })
  assert.equal(new DayLog(storage, new Date(2026, 9, 2, 12)).entries().length, 1)
  assert.equal(new DayLog(storage, new Date(2026, 9, 3, 9)).entries().length, 0)
})

test('notifications: someone starts waiting, finishes or fails; never on the first look, never for the demo', () => {
  const live = (status: string, activity: string, isDemo = false) => [{ id: 's1', label: 'repo', agents: [{ id: 'a', name: 'Explorador', status, activity, isDemo }] }]

  const first = changesOf(null, live('running', 'waiting'))
  assert.deepEqual(first.notes, [])

  const waiting = changesOf(changesOf(null, live('running', 'working')).seen, live('running', 'waiting'))
  assert.deepEqual(waiting.notes.map(note => note.title), ['Explorador espera tu permiso'])

  const done = changesOf(waiting.seen, live('done', 'working'))
  assert.deepEqual(done.notes.map(note => note.title), ['Explorador terminó'])

  const demo = changesOf(changesOf(null, live('running', 'working', true)).seen, live('failed', 'working', true))
  assert.deepEqual(demo.notes, [])
})
