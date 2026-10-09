// The hooks module: hears the session's real agents (their spawns, their own
// tool calls, their turns' ends), keeps the registry, draws the pane and its
// controls, and plays the sounds the scene asks for.

import { atom, read, update } from 'claude-code'
import type { Atom, EngineInterface, Register } from 'claude-code'

import type { OficinaScene, OficinaSettings } from '../types'
import type { OficinaAgent, OficinaBoss, OficinaOutcome, OficinaSnapshot, OficinaUsage } from '../types/snapshot'
import {
  activityOf,
  detailOf,
  touchOf,
  pruned,
  reconciled,
  started,
  stopped,
  tally,
  toolBegan,
  toolEnded,
  turnEnded,
  waiting,
  withoutDemo,
} from './agents.ts'
import type { TurnEnd } from './agents.ts'
import { DEMO_STEP_MS, demoStep } from './demo.ts'
import { langOf, say } from './i18n.ts'
import type { Lang, StringKey } from './i18n.ts'
import type { ReactionKind } from './scene/actors.ts'
import { stateOf } from './scene/world.ts'

const PANE = 'oficina'
const TITLE = 'Oficina'
/** Rows the scene takes: one row of desks, or two. */
const COMPACT_ROWS = 11
const EXPANDED_ROWS = 19
/** Rows of controls and tally above the scene, the buttons taking one row or two. */
const HEADER_ROWS = 5
const RECONCILE_MS = 4000
const CRACKS = 4
/** Sounds closer together than this are dropped, so a flurry never piles up. */
const SOUND_GAP_MS = 70
const STORE_KEY = 'settings'
const LOG_LINES = 300

/** The whip is a toy to switch on; the office first of all shows the agents. */
const DEFAULTS: OficinaSettings = {
  isWhipOn: false,
  isExpanded: false,
  isMuted: false,
  volume: 0.7,
  isPaused: false,
  isDemo: false,
}

/** The registry: the state holds it opaque (types/index.d.ts), the atom reads it as the snapshot's agents. */
const agents = atom({ plugin: 'oficina', key: 'agents' } as const, [] as OficinaAgent[]) as Atom<OficinaAgent[]>
const settings = atom({ plugin: 'oficina', key: 'settings' } as const, DEFAULTS)
const audioNote = atom({ plugin: 'oficina', key: 'audioNote' } as const, '')
const scene = atom({ plugin: 'oficina', key: 'scene' } as const, { status: 'waiting', since: 0, isProbeLoaded: false } as OficinaScene)
const SCENE_FAILED: OficinaScene['status'] = 'failed'
const SCENE_READY: OficinaScene['status'] = 'ready'
/** How long the surface gets to load the scene before the pane says it did not. */
const SCENE_WAIT_MS = 15_000

type Engine = EngineInterface

type SceneEvent = { k: 'crack'; i: number } | { k: 'hit'; id: string; s: ReactionKind }

const isSceneEvent = (value: unknown): value is SceneEvent =>
  typeof value === 'object' && value !== null && ((value as SceneEvent).k === 'crack' || (value as SceneEvent).k === 'hit')

// What the module keeps between dispatches; a reload starts these over, and
// everything the pane draws from lives in `$.state` instead.
let demoTimer: { cancel: () => void } | null = null
let demoAt = 0
let lastSoundAt = Number.NEGATIVE_INFINITY
let isClaiming = false
let lastCrack = -1
/** A hit sounds as a crack of the real recording, louder the harder it landed. */
const HIT_GAIN: Record<ReactionKind, number> = { light: 0.35, medium: 0.65, strong: 1, cover: 0.5 }

/**
 * The session's own Claude, the main loop: the office's boss. Kept here, not
 * in `$.state`, because only the desktop app draws it; a reload starts it
 * over as waiting for you, which the next turn corrects.
 */
let boss: OficinaBoss = { status: 'idle', activity: 'working', detail: '', since: 0, files: [], trail: [] }
/** Where the session runs: what the app's folder map is relative to. */
let liveCwd = ''

/** How a tool call's answer ended: an error the tool reported, or not. */
const outcomeOf = (result: unknown): OficinaOutcome =>
  typeof result === 'object' && result !== null && (result as { isError?: unknown }).isError === true ? 'err' : 'ok'

/** What the session has spent and how full its context is, read on the poll's beat. */
let usage: OficinaUsage | null = null

const readUsage = async ($: Engine) => {
  try {
    const { context, cost, rateLimits } = await $.session.usage()
    const tokens = context.tokens ?? 0
    const percent = context.percent ?? (context.window > 0 ? (100 * tokens) / context.window : 0)
    const limits = (rateLimits ?? []).map(one => ({ kind: one.kind, percentUsed: one.percentUsed, resetsAt: one.resetsAt ?? '' }))
    usage = { tokens, window: context.window, percent: Math.round(percent), usd: cost?.usd ?? 0, limits }
  } catch {
    // No figures this time: the last ones stand.
  }
}

const setBoss = async ($: Engine, next: Pick<OficinaBoss, 'status' | 'activity' | 'detail'> & Partial<Pick<OficinaBoss, 'files' | 'trail'>>) => {
  const isNew = next.status !== boss.status
  boss = { ...boss, ...next, since: isNew || boss.since === 0 ? await $.clock.now() : boss.since }
  await publish($)
}

let logPath: string | undefined
const logLines: string[] = []
/** Where this session's snapshot goes for the desktop app (liveDirOf); unset, nothing is written. */
let liveDir: string | undefined
let liveLabel = ''
/** The mod's version, from its own plugin.json, read as the session starts. */
let modVersion = 'unknown'
/** Claude Code's `language` setting, read as the session starts. */
let languageSetting: unknown

/** An absolute path: `C:\...`, `C:/...` or `/...`; never relative, never a network share. */
const isAbsolute = (path: string) => /^([A-Za-z]:[\\/]|\/(?![\\/]))/.test(path)
const joined = (dir: string, name: string) => (/[\\/]$/.test(dir) ? `${dir}${name}` : `${dir}/${name}`)

/**
 * The live folder: `OFICINA_LIVE_DIR`; else `CLAUDE_CONFIG_DIR`'s
 * `oficina-live`; else `.claude/oficina-live` in the home folder. A value
 * that is not an absolute path is passed over for the next rule.
 */
const liveDirOf = (env: { live?: string; config?: string; home?: string }): string | undefined => {
  const live = env.live?.trim()

  if (live && isAbsolute(live)) {
    return live
  }

  const config = env.config?.trim()

  if (config && isAbsolute(config)) {
    return joined(config, 'oficina-live')
  }

  const home = env.home?.trim()

  return home && isAbsolute(home) ? joined(home, '.claude/oficina-live') : undefined
}

/** A session's file name: its id with anything but `\w . -` made `_`, so it stays inside the folder. */
const fileNameOf = (sessionId: string) => sessionId.replace(/[^\w.-]/g, '_')

const quietly = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
  try {
    return await fn()
  } catch {
    return undefined
  }
}

/**
 * The language the mod speaks: `OFICINA_LANG`, else Claude Code's `language`
 * setting, else the locale (`LC_ALL`, `LANG`); Spanish when that looks
 * Spanish, else English.
 */
const langNow = async ($: Engine): Promise<Lang> =>
  langOf([
    await quietly(() => $.env.get('OFICINA_LANG')),
    languageSetting,
    await quietly(() => $.env.get('LC_ALL')),
    await quietly(() => $.env.get('LANG')),
  ])

/**
 * Writes the session's agents where the desktop app reads them: exactly an
 * OficinaSnapshot (types/snapshot.d.ts); the app never writes back. Called
 * on every change and on the poll's beat, which tells it the session is
 * alive. A failed write only means the app does not see them.
 */
const publish = async ($: Engine, isEnded = false, sessionId?: string) => {
  if (!liveDir) {
    return
  }

  try {
    const id = sessionId ?? (await $.session.id())
    const name = fileNameOf(id)

    if (name === '') {
      return
    }

    const all = await read($, agents)
    const { isDemo } = await read($, settings)
    const snapshot: OficinaSnapshot = {
      schemaVersion: 1,
      modVersion,
      session: id,
      label: liveLabel,
      cwd: liveCwd,
      updatedAt: await $.clock.now(),
      isEnded,
      agents: isDemo ? all : withoutDemo(all),
      boss,
      usage,
    }
    await $.fs.write(joined(liveDir, `${name}.json`), JSON.stringify(snapshot))
  } catch {
    // The app is an extra view; the session goes on without it.
  }
}

/**
 * Never lets the office break the session: a failed update is dropped. A
 * change that changes nothing writes nothing, so a quiet poll redraws nothing.
 */
const change = async ($: Engine, fn: (list: OficinaAgent[], now: number) => OficinaAgent[], what: string | (() => string)) => {
  try {
    const now = await $.clock.now()
    const apply = (list: OficinaAgent[]) => pruned(fn(list, now), now)
    const current = await read($, agents)

    if (apply(current) === current) {
      return
    }

    await update($, agents, apply)
    await publish($)

    if (logPath) {
      logLines.push(`${new Date(now).toISOString()} ${typeof what === 'string' ? what : what()}`)
      logLines.splice(0, Math.max(0, logLines.length - LOG_LINES))
      await $.fs.write(logPath, logLines.join('\n') + '\n')
    }
  } catch {
    // The registry is a view; the agent's work goes on regardless.
  }
}

const reconcile = async ($: Engine) => {
  try {
    const now = await $.clock.now()
    const { status, since } = await read($, scene)

    if (status === 'waiting' && since > 0 && now - since > SCENE_WAIT_MS) {
      await update($, scene, old => (old.status === 'waiting' ? { ...old, status: SCENE_FAILED } : old))
    }
  } catch {
    // The scene's state is a courtesy; the agents' is what matters.
  }

  try {
    const listed = await $.agent.list()
    await change($, (list, now) => reconciled(list, listed, now), () => `reconcile ${listed.map(a => `${a.type}:${a.status}`).join(',')}`)
  } catch {
    // No list this time: the registry stays as the events left it.
  }

  // The beat: the app takes a session whose file stops changing for gone.
  await readUsage($)
  await publish($)
}

const save = async ($: Engine, next: (old: OficinaSettings) => OficinaSettings) => {
  await update($, settings, next)
  await $.store.set(STORE_KEY, await read($, settings))
}

const setDemo = async ($: Engine, isOn: boolean | 'toggle') => {
  demoTimer?.cancel()
  demoTimer = null
  const saved = await update($, settings, old => ({ ...old, isDemo: isOn === 'toggle' ? !old.isDemo : isOn }))
  await $.store.set(STORE_KEY, saved)
  isOn = saved.isDemo

  if (!isOn) {
    await change($, withoutDemo, 'demo off')
    await publish($)

    return
  }

  demoAt = 0
  const lang = await langNow($)
  demoTimer = $.clock.every(DEMO_STEP_MS, () => {
    const step = demoAt
    demoAt += 1
    void change($, (list, now) => demoStep(list, step, now, lang), `demo ${step}`)
  })
}

const openPane = async ($: Engine) => {
  const { isExpanded } = await read($, settings)
  const now = await $.clock.now()
  // A scene that never loaded gets another chance with each opening.
  await update($, scene, (old): OficinaScene => (old.status === 'ready' ? old : { status: 'waiting', since: now, isProbeLoaded: false }))

  return $.ui.open({ id: PANE, title: TITLE, rows: (isExpanded ? EXPANDED_ROWS : COMPACT_ROWS) + HEADER_ROWS })
}

const play = async ($: Engine, event: SceneEvent) => {
  // One post at a time reads the clock, so two in a row cannot both pass the gap.
  if (isClaiming) {
    return
  }

  isClaiming = true

  try {
    const now = await $.clock.now()

    if (now - lastSoundAt < SOUND_GAP_MS) {
      return
    }

    lastSoundAt = now
  } finally {
    isClaiming = false
  }

  const { isMuted, volume } = await read($, settings)

  if (isMuted || volume <= 0) {
    return
  }

  try {
    // Cracks and hits alike: the real recording, never a made-up sound.
    const level = event.k === 'crack' ? 0.6 + 0.4 * event.i : HIT_GAIN[event.s]
    lastCrack = (lastCrack + 1 + Math.floor(Math.random() * (CRACKS - 1))) % CRACKS
    await $.audio.play({ asset: `fx/crack-${lastCrack + 1}.wav` }, { gain: volume * level })
  } catch (error) {
    // Said once in the pane, not pretended away.
    const lang = await langNow($)
    await update($, audioNote, () => say(lang, 'noSound', { reason: String(error).slice(0, 80) }))
  }
}

export const register: Register = on => {
  // --- The session ---------------------------------------------------------------

  on('session.start', async ($, e, next) => {
    liveDir = liveDirOf({
      live: await quietly(() => $.env.get('OFICINA_LIVE_DIR')),
      config: await quietly(() => $.env.get('CLAUDE_CONFIG_DIR')),
      home: (await quietly(() => $.env.get('USERPROFILE'))) || (await quietly(() => $.env.get('HOME'))),
    })
    liveLabel = e.cwd.split(/[\\/]/).filter(Boolean).pop() ?? ''
    liveCwd = e.cwd

    // The version the app compares against: the manifest's, its one source.
    const manifest = await quietly(() => $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`))
    const version = await quietly(async () => (JSON.parse(String(manifest)) as { version?: unknown }).version)
    modVersion = typeof version === 'string' && version !== '' ? version : 'unknown'

    languageSetting = (await quietly(() => $.settings.read()))?.language

    // A diagnostic log of every registry event, only when OFICINA_LOG asks for
    // it: beside the snapshot, as <session>.log, never anywhere else.
    const isLogging = !['', '0', 'false'].includes(((await quietly(() => $.env.get('OFICINA_LOG'))) ?? '').trim().toLowerCase())
    const logName = isLogging && liveDir ? fileNameOf((await quietly(() => $.session.id())) ?? '') : ''
    logPath = liveDir && logName !== '' ? joined(liveDir, `${logName}.log`) : undefined

    const stored = await $.store.get(STORE_KEY)

    if (typeof stored === 'object' && stored !== null) {
      // The demo starts off, whatever last session left; the whip stays where it was left.
      await update($, settings, () => ({ ...DEFAULTS, ...(stored as Partial<OficinaSettings>), isDemo: false }))
    }

    const lang = await langNow($)
    await $.command.register({
      name: 'oficina',
      description: say(lang, 'commandDescription'),
      argumentHint: say(lang, 'commandHint'),
    })

    await change($, withoutDemo, 'session.start')
    await reconcile($)
    $.clock.every(RECONCILE_MS, () => void reconcile($))

    // The pane opens only when asked (/oficina): the desktop app is the main view.
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    // Gone at once from the app, not after the beat runs out.
    await publish($, true, e.sessionId)

    return next(e)
  })

  on('command.run', { command: 'oficina' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const lang = await langNow($)

    if (arg === 'demo') {
      await setDemo($, 'toggle')
      await openPane($)
      const { isDemo } = await read($, settings)

      return { text: say(lang, isDemo ? 'demoOn' : 'demoOff') }
    }

    if (arg === 'latigo' || arg === 'látigo' || arg === 'whip') {
      await save($, old => ({ ...old, isWhipOn: !old.isWhipOn }))
      await openPane($)
      const { isWhipOn } = await read($, settings)

      return { text: say(lang, isWhipOn ? 'whipOn' : 'whipOff') }
    }

    // Only a pane the person can see is hidden: one waiting undrawn or
    // behind another tab is brought up instead.
    const pane = (await $.ui.panes()).find(one => one.id === PANE)

    if (pane?.isPlaced && pane.isShown) {
      await $.ui.close({ id: PANE })

      return { text: say(lang, 'paneHidden') }
    }

    const opened = await openPane($)

    if (!opened.isPlaced) {
      return { text: say(lang, 'paneFailed', { reason: opened.reason }) }
    }

    return { text: say(lang, 'paneOpened') }
  })

  // --- The agents, as the engine reports them -----------------------------------

  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)

    if (spawned.agentId !== undefined) {
      const id = spawned.agentId
      await change(
        $,
        (list, now) =>
          started(list, { id, name: e.name || e.description, type: e.subagentType, isBackground: e.background, parentId: e.parentAgentId }, now),
        `agent.spawn ${id} ${e.subagentType} background=${e.background}`,
      )
    }

    return spawned
  })

  on('classic.SubagentStart', async ($, e, next) => {
    await change($, (list, now) => started(list, { id: e.agent_id, type: e.agent_type }, now), `SubagentStart ${e.agent_id} ${e.agent_type}`)

    return next(e)
  })

  // Only an agent's own loop carries its id, so a tool is never pinned on the wrong one.
  on('tool.call', async ($, e, next) => {
    const id = e.agentId

    const args = e as unknown as Record<string, unknown>
    const detail = detailOf(e.tool, args)
    const touch = touchOf(e.tool, args, await $.clock.now())
    let outcome: OficinaOutcome = 'err'

    if (id === undefined) {
      // The main loop's own tool: the boss at work.
      const files = touch ? [...boss.files.filter(one => one.path !== touch.path), touch].slice(-8) : boss.files
      await setBoss($, { status: 'working', activity: activityOf(e.tool), detail, files })

      try {
        const result = await next(e)
        outcome = outcomeOf(result)

        return result
      } finally {
        const trail = [...boss.trail, outcome].slice(-8)
        const isIdle = boss.status === 'idle'
        await setBoss($, isIdle ? { status: boss.status, activity: boss.activity, detail: boss.detail, trail } : { status: 'working', activity: 'working', detail: '', trail })
      }
    }

    await change($, (list, now) => toolBegan(list, id, e.tool, detail, now, touch), `tool.call ${id} ${detail}`)

    try {
      const result = await next(e)
      outcome = outcomeOf(result)

      return result
    } finally {
      await change($, (list, now) => toolEnded(list, id, now, outcome), `tool.done ${id} ${e.tool} ${outcome}`)
    }
  })

  on('classic.PermissionRequest', async ($, e, next) => {
    const id = e.agent_id

    if (id !== undefined) {
      await change($, list => waiting(list, id), `PermissionRequest ${id} ${e.tool_name}`)
    } else {
      await setBoss($, { status: 'waiting', activity: 'waiting', detail: boss.detail })
    }

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    // A subagent's turn carries its loop's id; the main loop's carries none.
    if ((e as { agentId?: string }).agentId === undefined) {
      await setBoss($, { status: 'working', activity: 'working', detail: '' })
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const id = e.agentId

    if (id !== undefined) {
      const reason: TurnEnd = e.reason
      await change($, (list, now) => turnEnded(list, id, reason, now), `turn.complete ${id} ${reason}`)
    } else {
      // Its turn is over: the boss waits for you.
      await setBoss($, { status: 'idle', activity: 'working', detail: '' })
    }

    return next(e)
  })

  on('classic.SubagentStop', async ($, e, next) => {
    await change($, (list, now) => stopped(list, e.agent_id, now), `SubagentStop ${e.agent_id}`)

    return next(e)
  })

  // --- Sound: the scene posts what happened, the engine plays it ---------------

  on('ui.message', async ($, e, next) => {
    const said = (e.data as { scene?: unknown } | null)?.scene

    if (said === 'ready') {
      await update($, scene, old => ({ ...old, status: SCENE_READY }))
    } else if (said === 'probe') {
      await update($, scene, old => ({ ...old, isProbeLoaded: true }))
    }

    const events = (e.data as { events?: unknown } | null)?.events

    if (Array.isArray(events)) {
      // The hit outranks the crack that came with it: one sound, at the hit's loudness.
      const heard = events.filter(isSceneEvent)
      const event = heard.find(one => one.k === 'hit') ?? heard[0]

      if (event) {
        void play($, event)
      }
    }

    return next(e)
  })

  // --- The pane --------------------------------------------------------------------------

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const all = await read($, agents)
    const s = await read($, settings)
    const note = await read($, audioNote)
    const loaded = await read($, scene)
    const lang = await langNow($)
    const t = (key: StringKey, vars?: Record<string, string | number>) => say(lang, key, vars)
    const shown = s.isDemo ? all : withoutDemo(all)
    const count = tally(shown)
    const summary = [
      count.waiting ? t('activeWaiting', { n: count.active, waiting: count.waiting }) : t('active', { n: count.active }),
      t('done', { n: count.done }),
      count.failed ? t('failed', { n: count.failed }) : '',
      count.unknown ? t('unknown', { n: count.unknown }) : '',
      s.isDemo ? t('demoBanner') : '',
    ]
      .filter(Boolean)
      .join(' · ')
    const rowOf = (agent: OficinaAgent) => `${agent.name || agent.type || t('agent')} · ${stateOf(agent, lang)} ${agent.detail}`.trimEnd()

    if (e.surface !== 'terminal' && e.surface !== 'desktop') {
      // No pointer and no frame clock here: the same registry, as a list.
      const { Box, Text } = $.ui.resolve(e)

      return (
        <Box flexDirection="column">
          <Text dimColor>{summary}</Text>
          {shown
            .filter(agent => agent.status !== 'done')
            .map(agent => (
              <Text key={agent.id}>{rowOf(agent)}</Text>
            ))}
        </Box>
      )
    }

    const { Box, Button, Client, Text } = $.ui.resolve(e)
    const percent = Math.round(s.volume * 100)
    const failure =
      loaded.status !== 'failed'
        ? ''
        : loaded.isProbeLoaded
          ? t('sceneFailedProbe')
          : t('sceneFailed')

    return (
      <Box flexDirection="column">
        <Box flexWrap="wrap" columnGap={1}>
          <Button
            key="whip"
            label={t(s.isWhipOn ? 'whipButtonOn' : 'whipButtonOff')}
            variant={s.isWhipOn ? 'primary' : 'secondary'}
            onPress={() => {
              void save($, old => ({ ...old, isWhipOn: !old.isWhipOn }))
            }}
          />
          <Button
            key="view"
            label={t(s.isExpanded ? 'viewWide' : 'viewCompact')}
            onPress={() => {
              void save($, old => ({ ...old, isExpanded: !old.isExpanded })).then(() => openPane($))
            }}
          />
          <Button
            key="mute"
            label={s.isMuted ? t('soundOff') : t('soundOn', { percent })}
            onPress={() => {
              void save($, old => ({ ...old, isMuted: !old.isMuted }))
            }}
          />
          <Button
            key="quieter"
            label={t('quieter')}
            onPress={() => {
              void save($, old => ({ ...old, volume: Math.max(0, Math.round(old.volume * 10 - 1) / 10) }))
            }}
          />
          <Button
            key="louder"
            label={t('louder')}
            onPress={() => {
              void save($, old => ({ ...old, isMuted: false, volume: Math.min(1, Math.round(old.volume * 10 + 1) / 10) }))
            }}
          />
          <Button
            key="pause"
            label={t(s.isPaused ? 'animationPaused' : 'animationOn')}
            onPress={() => {
              void save($, old => ({ ...old, isPaused: !old.isPaused }))
            }}
          />
          <Button
            key="demo"
            label={t(s.isDemo ? 'demoButtonOn' : 'demoButton')}
            onPress={() => {
              void setDemo($, 'toggle')
            }}
          />
          <Button
            key="hide"
            label={t('hide')}
            role="dismiss"
            onPress={() => {
              void $.ui.close({ id: PANE })
            }}
          />
        </Box>
        <Text key="tally" dimColor>
          {summary}
        </Text>
        {note !== '' && <Text key="note" dimColor>{note}</Text>}
        {failure !== '' && (
          <Text key="failure" color="yellow">
            {failure}
          </Text>
        )}
        {failure !== '' &&
          shown
            .filter(agent => agent.status !== 'done')
            .map(agent => (
              <Text key={`row-${agent.id}`}>{rowOf(agent)}</Text>
            ))}
        <Client
          key="office"
          module="./office.tsx"
          props={{ agents: shown, isWhipOn: s.isWhipOn, isPaused: s.isPaused, lang }}
          width="100%"
          height={s.isExpanded ? EXPANDED_ROWS : COMPACT_ROWS}
        />
        {loaded.status !== 'ready' && !loaded.isProbeLoaded && (
          <Client key="probe" module="./probe.tsx" props={null} width={1} height={1} />
        )}
      </Box>
    )
  })
}
