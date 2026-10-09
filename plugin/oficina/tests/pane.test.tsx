import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const PANE = { plugin: 'oficina', component: 'Pane', requestId: 'oficina' } as const
const PROPS = { title: 'Oficina', isFocused: false, bodyColumns: 80, placement: 'dock' } as never

const textOf = (tree: unknown) => JSON.stringify(tree)

/**
 * For the tests that drive a hundred frames or more of pointer and clock:
 * well under a second alone, they slow down on a busy machine, and the
 * default 5 s budget should not be what fails them.
 */
const LONG = { timeoutMs: 30_000 }

/** The whip starts put away: the tests that lash take it in hand first. */
const takeWhip = async (ui: { find: (q: { key: string }) => Promise<{ text?: string } | undefined>; press: (q: { key: string }) => Promise<unknown> }) => {
  if ((await ui.find({ key: 'whip' }))?.text === 'Látigo: guardado') {
    await ui.press({ key: 'whip' })
  }

  expect((await ui.find({ key: 'whip' }))?.text).toBe('Látigo: en mano')
}

/** The words the pane tests read are the Spanish ones; the English ones have a test of their own. */
const SPANISH = { OFICINA_LANG: 'es' }

/** Stands in for the engine beneath the mod: an empty agent list, a pane that opens. */
const beneath = (on: On, clockStart = 0, env: Record<string, string> = SPANISH) => {
  mock.store(on)
  mock.env(on, env)
  on('agent.list', () => ({ value: [] }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.close', () => ({ value: undefined }) as never)
  on('ui.panes', () => ({ value: [] }) as never)
  on('classic.SubagentStart', () => ({}))
  on('classic.SubagentStop', () => ({}))

  return mock.clock(on, { now: clockStart })
}

test('a real subagent takes a desk when it starts and is tallied when it stops', async ($, on) => {
  beneath(on, 1_000_000)

  for (const surface of ['desktop', 'terminal'] as const) {
    const id = `agent-${surface}`
    const ui = await $.ui.mount({ ...PANE, surface, props: PROPS })
    await ui.resize({ columns: 80, rows: 11, in: 'office' })

    await $.classic.SubagentStart({ agent_id: id, agent_type: 'Explore' })
    await ui.advance(1600)
    expect((await ui.find({ type: 'Text', text: /En curso/ }))?.text).toContain('En curso: 1')
    expect(textOf(await ui.drawn({ in: 'office' }))).toContain('Explore')
    // Its body is on screen, in the mascot's colour.
    expect(textOf(await ui.drawn({ in: 'office' }))).toContain('#D97757')

    await $.classic.SubagentStop({
      agent_id: id,
      agent_type: 'Explore',
      stop_hook_active: false,
      agent_transcript_path: '',
    })
    await ui.advance(400)
    expect((await ui.find({ type: 'Text', text: /En curso/ }))?.text).toContain('En curso: 0')
    await ui.unmount()
  }
})

test('several agents at once each get a character', async ($, on) => {
  beneath(on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PROPS })
  await ui.resize({ columns: 80, rows: 11, in: 'office' })

  for (const type of ['Explore', 'Plan', 'general-purpose']) {
    await $.classic.SubagentStart({ agent_id: `multi-${type}`, agent_type: type })
  }

  await ui.advance(1600)
  const drawn = textOf(await ui.drawn({ in: 'office' }))
  expect((await ui.find({ type: 'Text', text: /En curso/ }))?.text).toContain('En curso: 3')
  expect(drawn).toContain('Explore')
  expect(drawn).toContain('Plan')
  expect(drawn).toContain('general-pur')
  await ui.unmount()
})

test('the controls switch the whip, the view, the sound and the animation', async ($, on) => {
  beneath(on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PROPS })

  // Put away from the start: the whip is a toy to switch on.
  expect((await ui.find({ key: 'whip' }))?.text).toBe('Látigo: guardado')
  await ui.press({ key: 'whip' })
  expect((await ui.find({ key: 'whip' }))?.text).toBe('Látigo: en mano')

  await ui.press({ key: 'mute' })
  expect((await ui.find({ key: 'mute' }))?.text).toBe('Sonido: no')
  await ui.press({ key: 'louder' })
  expect((await ui.find({ key: 'mute' }))?.text).toBe('Sonido: 80%')
  await ui.press({ key: 'quieter' })
  await ui.press({ key: 'quieter' })
  expect((await ui.find({ key: 'mute' }))?.text).toBe('Sonido: 60%')

  await ui.press({ key: 'pause' })
  expect((await ui.find({ key: 'pause' }))?.text).toBe('Animación: pausada')
  await ui.press({ key: 'pause' })

  await ui.press({ key: 'view' })
  expect((await ui.find({ key: 'view' }))?.text).toBe('Vista: amplia')
  await ui.press({ key: 'view' })
  await ui.press({ key: 'whip' })
  await ui.unmount()
})

test('the demo is labelled, synthetic, and cleans up after itself', async ($, on) => {
  const clock = beneath(on)
  let spawns = 0
  on('agent.spawn', () => {
    spawns += 1

    return { model: 'none' }
  })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PROPS })
  await ui.resize({ columns: 80, rows: 11, in: 'office' })

  await ui.press({ key: 'demo' })
  await clock.advance(4000)
  await ui.advance(1200)
  expect((await ui.find({ key: 'demo' }))?.text).toBe('DEMO: encendida')
  expect((await ui.find({ type: 'Text', text: /En curso/ }))?.text).toContain('DEMO: agentes simulados')
  expect((await ui.find({ type: 'Text', text: /En curso/ }))?.text).toContain('En curso: 3')
  expect(textOf(await ui.drawn({ in: 'office' }))).toContain('Explorador')

  await ui.press({ key: 'demo' })
  await ui.advance(200)
  expect((await ui.find({ type: 'Text', text: /En curso/ }))?.text).toContain('En curso: 0')
  expect(spawns).toBe(0)
  await ui.unmount()
})

test('a crack of the whip in the pane reaches the speakers; muted, it does not', LONG, async ($, on) => {
  const clock = beneath(on)
  const played: string[] = []
  on('audio.play', (_$, e) => {
    played.push(e.clip.asset ?? 'other')

    return { value: undefined } as never
  })

  for (const surface of ['desktop', 'terminal'] as const) {
    played.length = 0
    const ui = await $.ui.mount({ ...PANE, surface, props: PROPS })
    await ui.resize({ columns: 80, rows: 11, in: 'office' })
    await takeWhip(ui)
    await ui.advance(400)

    // The whip rests with its grip nine cells from the right edge.
    await ui.pointer({ type: 'down', x: 71, y: 1, button: 'left' })

    for (let frame = 0; frame < 50; frame++) {
      await ui.pointer({ type: 'move', x: frame % 6 < 3 ? 76 : 44, y: 1, button: 'left' })
      await ui.advance(40)
      await clock.advance(40)
    }

    await ui.pointer({ type: 'up', x: 60, y: 1, button: 'left' })
    expect(played.length).toBeGreaterThan(0)
    expect(played.every(clip => /^fx\/crack-[1-4]\.wav$/.test(clip))).toBe(true)

    const before = played.length
    await ui.press({ key: 'mute' })
    await ui.advance(4000)
    const { x } = { x: 60 }
    await ui.pointer({ type: 'down', x, y: 1, button: 'left' })

    for (let frame = 0; frame < 30; frame++) {
      await ui.pointer({ type: 'move', x: frame % 6 < 3 ? 76 : 44, y: 1, button: 'left' })
      await ui.advance(40)
      await clock.advance(40)
    }

    await ui.pointer({ type: 'up', x: 60, y: 1, button: 'left' })
    expect(played.length).toBe(before)
    await ui.press({ key: 'mute' })
    await ui.unmount()
  }
})

test('hitting a character sounds the real crack, and its agent goes on as before', LONG, async ($, on) => {
  const clock = beneath(on)
  const played: string[] = []
  on('audio.play', (_$, e) => {
    played.push(e.clip.asset && /^fx\/crack-[1-4]\.wav$/.test(e.clip.asset) ? 'crack' : 'other')

    return { value: undefined } as never
  })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PROPS })
  await ui.resize({ columns: 80, rows: 11, in: 'office' })
  await $.classic.SubagentStart({ agent_id: 'victim', agent_type: 'Explore' })
  await takeWhip(ui)
  await ui.advance(1600)

  await ui.pointer({ type: 'down', x: 71, y: 1, button: 'left' })

  // Over the first desk, lashing down across whoever sits there.
  for (let frame = 0; frame < 120; frame++) {
    await ui.pointer({ type: 'move', x: 7 + (frame % 4 < 2 ? -3 : 3), y: frame % 8 < 4 ? 6 : 1, button: 'left' })
    await ui.advance(40)
    await clock.advance(40)
  }

  await ui.pointer({ type: 'up', x: 7, y: 1, button: 'left' })
  expect(played.length).toBeGreaterThan(0)
  expect(played.every(clip => clip === 'crack')).toBe(true)
  expect((await ui.find({ type: 'Text', text: /En curso/ }))?.text).toContain('En curso: 1')
  await ui.unmount()
})

test('the whip is picked up wherever the press lands, right over a character', LONG, async ($, on) => {
  const clock = beneath(on)
  const played: string[] = []
  on('audio.play', (_$, e) => {
    played.push(e.clip.asset && /^fx\/crack-[1-4]\.wav$/.test(e.clip.asset) ? 'crack' : 'other')

    return { value: undefined } as never
  })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PROPS })
  await ui.resize({ columns: 80, rows: 11, in: 'office' })
  await $.classic.SubagentStart({ agent_id: 'near', agent_type: 'Explore' })
  await takeWhip(ui)
  await ui.advance(1600)

  // Nowhere near the handle: straight above the first desk.
  await ui.pointer({ type: 'down', x: 7, y: 2, button: 'left' })

  for (let frame = 0; frame < 120; frame++) {
    await ui.pointer({ type: 'move', x: 7 + (frame % 4 < 2 ? -3 : 3), y: frame % 8 < 4 ? 6 : 1, button: 'left' })
    await ui.advance(40)
    await clock.advance(40)
  }

  await ui.pointer({ type: 'up', x: 7, y: 1, button: 'left' })
  expect(played.length).toBeGreaterThan(0)
  expect(played.every(clip => clip === 'crack')).toBe(true)
  await ui.unmount()
})

test('surfaces with no pointer get the same agents as a list', async ($, on) => {
  beneath(on)
  await $.classic.SubagentStart({ agent_id: 'listed', agent_type: 'Plan' })

  for (const surface of ['vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface, props: PROPS })
    expect(textOf(await ui.drawn())).toContain('Plan')
    await ui.unmount()
  }
})

test('/oficina brings up a pane that waits undrawn or behind a tab, and says why when it cannot', async ($, on) => {
  mock.store(on)
  mock.env(on, SPANISH)
  let panes = [{ id: 'oficina', title: 'Oficina', isShown: false, isFocused: false, isPlaced: false }]
  let opens = 0
  let closes = 0
  let placed: { isPlaced: true } | { isPlaced: false; reason: string } = { isPlaced: true }
  on('agent.list', () => ({ value: [] }) as never)
  on('ui.panes', () => ({ value: panes }) as never)
  on('ui.open', () => {
    opens += 1

    return { value: placed } as never
  })
  on('ui.close', () => {
    closes += 1

    return { value: undefined } as never
  })
  mock.clock(on, { now: 0 })
  const run = () => $.command.run({ command: 'oficina', args: '', origin: { kind: 'composer' } } as never)

  // Left undrawn: the command shows it, it does not hide it.
  expect(textOf(await run())).toContain('Oficina abierta')
  expect(closes).toBe(0)

  // Drawn and in front: now the same command hides it.
  panes = [{ ...panes[0]!, isShown: true, isPlaced: true }]
  expect(textOf(await run())).toContain('Oficina oculta')
  expect(closes).toBe(1)

  // A surface that places no panes: said plainly, with the engine's reason.
  panes = []
  placed = { isPlaced: false, reason: 'this desktop places no panes' }
  expect(textOf(await run())).toContain('this desktop places no panes')
  expect(opens).toBeGreaterThan(1)
})

test('a scene that loads reports in, so the pane never falls back to the list', async ($, on) => {
  const clock = beneath(on)
  await $.classic.SubagentStart({ agent_id: 'seen', agent_type: 'Explore' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PROPS })
  await ui.resize({ columns: 80, rows: 11, in: 'office' })
  await ui.advance(1000)
  await clock.advance(20_000)
  await ui.advance(200)

  expect(await ui.find({ key: 'failure' })).toBeUndefined()
  expect(textOf(await ui.drawn({ in: 'office' }))).toContain('Explore')
  await ui.unmount()
})

/**
 * Stands in for a whole session beneath the mod, its files kept in memory:
 * the environment given, a manifest at version 9.8.7, the usage figures.
 */
const live = (on: On, env: Record<string, string>, sessionId = 'ses-1') => {
  const clock = beneath(on, 0, env)
  const written = new Map<string, string>()
  const reads: string[] = []
  on('fs.read', (_$, e) => {
    const path = (e as unknown as { path: string }).path.replace(/\\/g, '/')
    reads.push(path)

    if (!path.endsWith('/.claude-plugin/plugin.json')) {
      throw new Error(`ENOENT: ${path}`)
    }

    return { value: JSON.stringify({ name: 'oficina', version: '9.8.7' }) } as never
  })
  on('fs.write', (_$, e) => {
    const { path, text } = e as unknown as { path: string; text: string }
    // The engine spells the path the platform's way: kept by its parts.
    written.set(path.replace(/\\/g, '/'), text)

    return { value: undefined } as never
  })
  on('session.id', () => ({ value: sessionId }) as never)
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 50_000, window: 200_000, percent: 25 }, rateLimits: [{ kind: 'five_hour', percentUsed: 62.5, resetsAt: '2026-10-06T21:40:00Z' }], cost: { usd: 1.25 } } }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('session.start', () => ({ cwd: 'D:/proj/mi-repo' }) as never)
  on('session.end', () => ({ sessionId }) as never)
  on('turn.start', () => ({ turnId: 't1' }) as never)
  on('turn.complete', () => ({ text: '' }) as never)

  return { clock, written, reads, json: (path: string) => JSON.parse(written.get(path) ?? '{}') }
}

const START = { cwd: 'D:/proj/mi-repo', surface: 'terminal', isInteractive: false } as const

/** Every rule's variable set at once, so each test shows which one wins. */
const ALL = { OFICINA_LIVE_DIR: 'D:/vivo', CLAUDE_CONFIG_DIR: 'D:/claude-config', USERPROFILE: 'D:/perfiles/ana', HOME: '/home/ana' }

test('each change goes to OFICINA_LIVE_DIR as a whole snapshot, and the end says so', async ($, on) => {
  const { clock, written, reads, json } = live(on, ALL)
  const file = 'D:/vivo/ses-1.json'

  await $.session.start(START)
  await $.classic.SubagentStart({ agent_id: 'live-1', agent_type: 'Explore' })
  await clock.advance(100)

  expect(json(file)).toMatchObject({ schemaVersion: 1, modVersion: '9.8.7', session: 'ses-1', label: 'mi-repo', cwd: 'D:/proj/mi-repo', isEnded: false })
  expect(json(file).agents.map((agent: { id: string }) => agent.id)).toContain('live-1')
  // The version is read from the mod's own manifest, its one source.
  expect(reads.some(path => /\/oficina\/\.claude-plugin\/plugin\.json$/.test(path))).toBe(true)

  // On the poll's beat, what the session spent and how full its context is.
  await clock.advance(4100)
  expect(json(file).usage).toEqual({
    tokens: 50_000,
    window: 200_000,
    percent: 25,
    usd: 1.25,
    limits: [{ kind: 'five_hour', percentUsed: 62.5, resetsAt: '2026-10-06T21:40:00Z' }],
  })

  // The session's own Claude, the boss: at work in a turn, waiting for you after it.
  await $.turn.start({ text: 'hola', turnId: 't1' } as never)
  expect(json(file).boss).toMatchObject({ status: 'working', activity: 'working', files: [], trail: [] })
  await $.turn.complete({ reason: 'answer', turnId: 't1', answer: 'listo' } as never)
  expect(json(file).boss).toMatchObject({ status: 'idle' })
  expect(Object.keys(json(file).boss).sort()).toEqual(['activity', 'detail', 'files', 'since', 'status', 'trail'])

  await $.session.end({ reason: 'other', sessionId: 'ses-1' } as never)
  expect(json(file).isEnded).toBe(true)

  // Exactly the snapshot's fields, and nothing written anywhere else.
  expect(Object.keys(json(file)).sort()).toEqual([
    'agents',
    'boss',
    'cwd',
    'isEnded',
    'label',
    'modVersion',
    'schemaVersion',
    'session',
    'updatedAt',
    'usage',
  ])
  expect([...written.keys()]).toEqual([file])
})

test('without OFICINA_LIVE_DIR the snapshot goes to CLAUDE_CONFIG_DIR/oficina-live', async ($, on) => {
  const { clock, written } = live(on, { ...ALL, OFICINA_LIVE_DIR: '' })
  await $.session.start(START)
  await clock.advance(100)

  expect([...written.keys()]).toEqual(['D:/claude-config/oficina-live/ses-1.json'])
})

test('with neither, it goes to .claude/oficina-live in the home folder, USERPROFILE before HOME', async ($, on) => {
  const { clock, written } = live(on, { USERPROFILE: 'D:/perfiles/ana', HOME: '/home/ana' })
  await $.session.start(START)
  await clock.advance(100)

  expect([...written.keys()]).toEqual(['D:/perfiles/ana/.claude/oficina-live/ses-1.json'])
})

test('HOME stands in for USERPROFILE, and a relative folder is passed over', async ($, on) => {
  const { clock, written } = live(on, { OFICINA_LIVE_DIR: 'vivo', CLAUDE_CONFIG_DIR: '../config', HOME: '/home/ana' })
  await $.session.start(START)
  await clock.advance(100)

  // On Windows the engine puts the current drive before a path from the root.
  expect([...written.keys()].map(path => path.replace(/^[A-Za-z]:(?=\/)/, ''))).toEqual(['/home/ana/.claude/oficina-live/ses-1.json'])
})

test('with no folder to write to, nothing is written', async ($, on) => {
  const { clock, written } = live(on, {})
  await $.session.start(START)
  await $.classic.SubagentStart({ agent_id: 'live-1', agent_type: 'Explore' })
  await clock.advance(4100)

  expect(written.size).toBe(0)
})

test('a session id that spells a path still lands inside the live folder', async ($, on) => {
  const { clock, written } = live(on, { OFICINA_LIVE_DIR: 'D:/vivo' }, '../../evil\\x')
  await $.session.start(START)
  await clock.advance(100)

  expect([...written.keys()]).toEqual(['D:/vivo/.._.._evil_x.json'])
})

test('the session starts with the whip put away and no pane open; /oficina opens it', async ($, on) => {
  mock.store(on)
  mock.env(on, SPANISH)
  mock.clock(on, { now: 0 })
  let opens = 0
  on('agent.list', () => ({ value: [] }) as never)
  on('ui.panes', () => ({ value: [] }) as never)
  on('ui.open', () => {
    opens += 1

    return { value: { isPlaced: true } } as never
  })
  on('command.register', () => ({ value: undefined }) as never)
  on('session.start', () => ({ cwd: 'D:/proj/mi-repo' }) as never)

  await $.session.start({ ...START, isInteractive: true })
  expect(opens).toBe(0)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: PROPS })
  expect((await ui.find({ key: 'whip' }))?.text).toBe('Látigo: guardado')
  await ui.unmount()

  expect(textOf(await $.command.run({ command: 'oficina', args: '', origin: { kind: 'composer' } } as never))).toContain('Oficina abierta')
  expect(opens).toBe(1)
})

test('a whip left in hand last session is still in hand', async ($, on) => {
  mock.store(on, { settings: { isWhipOn: true } })
  mock.env(on, SPANISH)
  mock.clock(on, { now: 0 })
  on('agent.list', () => ({ value: [] }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('session.start', () => ({ cwd: 'D:/proj/mi-repo' }) as never)

  await $.session.start({ ...START, isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: PROPS })
  expect((await ui.find({ key: 'whip' }))?.text).toBe('Látigo: en mano')
  await ui.unmount()
})

test('the pane and the command speak English unless the language looks Spanish', async ($, on) => {
  beneath(on, 0, { LANG: 'en_US.UTF-8' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PROPS })
  await ui.resize({ columns: 80, rows: 11, in: 'office' })
  await $.classic.SubagentStart({ agent_id: 'en-1', agent_type: 'Explore' })
  await ui.advance(400)

  expect((await ui.find({ key: 'whip' }))?.text).toBe('Whip: put away')
  expect((await ui.find({ key: 'hide' }))?.text).toBe('Hide')
  expect((await ui.find({ type: 'Text', text: /Running/ }))?.text).toContain('Running: 1')
  expect(textOf(await ui.drawn({ in: 'office' }))).toContain('Click an agent')
  await ui.unmount()

  expect(textOf(await $.command.run({ command: 'oficina', args: 'whip', origin: { kind: 'composer' } } as never))).toContain('Whip in hand.')
})

const LOCALES: [Record<string, string>, string][] = [
  [{ LANG: 'es_AR.UTF-8' }, 'Látigo: guardado'],
  [{ LC_ALL: 'es_ES.UTF-8', LANG: 'en_US.UTF-8' }, 'Látigo: guardado'],
  [{ OFICINA_LANG: 'en', LANG: 'es_AR.UTF-8' }, 'Whip: put away'],
  [{}, 'Whip: put away'],
]

for (const [env, word] of LOCALES) {
  test(`the language follows ${JSON.stringify(env)}`, async ($, on) => {
    beneath(on, 0, env)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: PROPS })
    expect((await ui.find({ key: 'whip' }))?.text).toBe(word)
    await ui.unmount()
  })
}

test('the language setting of Claude Code picks Spanish over an English locale', async ($, on) => {
  beneath(on, 0, { LANG: 'en_US.UTF-8' })
  const registered: { description?: string }[] = []
  on('settings.read', () => ({ value: { language: 'spanish' } }) as never)
  on('command.register', (_$, e) => {
    registered.push(e as never)

    return { value: undefined } as never
  })
  on('session.start', () => ({ cwd: 'D:/proj/mi-repo' }) as never)

  await $.session.start(START)
  expect(registered[0]?.description).toContain('Muestra u oculta')
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: PROPS })
  expect((await ui.find({ key: 'whip' }))?.text).toBe('Látigo: guardado')
  await ui.unmount()
})
