// Demo scenes the app plays by itself, no Claude Code needed: a made-up
// session whose agents walk through a story on a loop. Every agent is
// flagged as a demo, the session is labelled DEMO, and nothing here reaches
// a real agent or notifies anyone.

import type { LiveSession } from './shared'

export type SceneKind = 'team' | 'rough' | 'chaos'

export const SCENES: { value: SceneKind; label: string }[] = [
  { value: 'team', label: 'Equipo de seis' },
  { value: 'rough', label: 'Entrega accidentada' },
  { value: 'chaos', label: 'Oficina caótica' },
]

/** The session id every scene uses: what tells it apart from a real one. */
export const SCENE_ID = 'demo-escena'
const CWD = 'C:/demo/proyecto'
/** Seconds one run of a scene lasts before it starts over. */
const LOOP = 60

type Step = { at: number; status?: string; activity?: string; detail?: string; file?: string; isWrite?: boolean; outcome?: 'ok' | 'err' }

type Cast = { id: string; name: string; type: string; enters: number; parentId?: string; steps: Step[] }

const work = (at: number, activity: string, detail: string, file?: string, isWrite = false, outcome: 'ok' | 'err' = 'ok'): Step => ({
  at,
  status: 'running',
  activity,
  detail,
  file,
  isWrite,
  outcome,
})

const CASTS: Record<SceneKind, { boss: Step[]; cast: Cast[]; usage: number }> = {
  team: {
    usage: 42,
    boss: [work(0, 'working', ''), { at: 50, status: 'idle', activity: 'working', detail: '' }],
    cast: [
      { id: 'e', name: 'Explorador', type: 'Explore', enters: 1, steps: [work(2, 'searching', 'Grep TODO', 'src/app.ts'), work(8, 'reading', 'Read router.ts', 'src/router.ts'), { at: 26, status: 'done' }] },
      { id: 'p', name: 'Planificador', type: 'Plan', enters: 2.5, steps: [work(4, 'reading', 'Read README.md', 'README.md'), work(12, 'working', ''), { at: 30, status: 'done' }] },
      { id: 'i1', name: 'Implementador', type: 'general-purpose', enters: 4, steps: [work(6, 'editing', 'Edit app.ts', 'src/app.ts', true), work(14, 'tool', 'Bash npm', undefined, false, 'err'), work(18, 'tool', 'Bash npm', undefined, false), { at: 38, status: 'done' }] },
      { id: 'i2', name: 'Implementadora', type: 'general-purpose', enters: 5.5, parentId: 'i1', steps: [work(8, 'editing', 'Edit app.ts', 'src/app.ts', true), work(16, 'editing', 'Edit api.ts', 'src/api.ts', true), { at: 40, status: 'done' }] },
      { id: 'r', name: 'Revisor', type: 'general-purpose', enters: 7, steps: [work(10, 'reading', 'Read app.ts', 'src/app.ts'), work(20, 'waiting', 'Edit app.ts'), work(24, 'editing', 'Edit app.ts', 'src/app.ts', true), { at: 44, status: 'done' }] },
      { id: 't', name: 'Tester', type: 'general-purpose', enters: 8.5, parentId: 'r', steps: [work(12, 'tool', 'Bash test', 'test/app.test.ts'), work(22, 'editing', 'Edit app.test.ts', 'test/app.test.ts', true), { at: 46, status: 'done' }] },
    ],
  },
  rough: {
    usage: 88,
    boss: [work(0, 'working', ''), { at: 14, status: 'waiting', activity: 'waiting', detail: 'Bash deploy' }, work(24, 'tool', 'Bash deploy'), { at: 52, status: 'idle', activity: 'working', detail: '' }],
    cast: [
      { id: 'a', name: 'Migrador', type: 'general-purpose', enters: 1, steps: [work(3, 'editing', 'Edit schema.sql', 'db/schema.sql', true), work(9, 'tool', 'Bash migrate', undefined, false, 'err'), work(13, 'tool', 'Bash migrate', undefined, false, 'err'), work(17, 'tool', 'Bash migrate'), { at: 34, status: 'done' }] },
      { id: 'b', name: 'Revisor', type: 'general-purpose', enters: 2, steps: [work(5, 'reading', 'Read schema.sql', 'db/schema.sql'), work(11, 'waiting', 'Edit schema.sql'), work(20, 'editing', 'Edit schema.sql', 'db/schema.sql', true), { at: 36, status: 'done' }] },
      { id: 'c', name: 'Deployer', type: 'general-purpose', enters: 3, steps: [work(6, 'tool', 'Bash build', undefined, false, 'err'), work(15, 'tool', 'Bash build', undefined, false, 'err'), { at: 22, status: 'failed' }] },
    ],
  },
  chaos: {
    usage: 71,
    boss: [work(0, 'working', ''), { at: 18, status: 'waiting', activity: 'waiting', detail: 'Write config' }, work(26, 'editing', 'Edit config.ts', 'src/config.ts', true)],
    cast: Array.from({ length: 10 }, (_, i) => ({
      id: `x${i}`,
      name: ['Explorador', 'Planificador', 'Revisor', 'Tester', 'Implementador'][i % 5]!,
      type: ['Explore', 'Plan', 'general-purpose', 'general-purpose', 'general-purpose'][i % 5]!,
      enters: 0.6 * i,
      parentId: i > 4 ? `x${i - 5}` : undefined,
      steps: Array.from({ length: 12 }, (_, k) => {
        const kinds = [
          ['searching', 'Grep bug', 'src/core.ts', false],
          ['editing', 'Edit core.ts', 'src/core.ts', true],
          ['reading', 'Read docs.md', 'docs/docs.md', false],
          ['tool', 'Bash test', 'test/core.test.ts', false],
          ['editing', 'Edit ui.tsx', 'ui/ui.tsx', true],
        ] as const
        const [activity, detail, file, isWrite] = kinds[(i + k) % kinds.length]!

        return work(2 + 0.6 * i + k * 3.5, activity, detail, file, isWrite, (i + k) % 7 === 0 ? 'err' : 'ok')
      }).concat(i % 4 === 3 ? [{ at: 46 + i, status: 'failed' }] : [{ at: 48 + i, status: 'done' }]),
    })),
  },
}

/** The scene at `t` seconds into it, as a live session; `now` is epoch ms. */
export const sceneAt = (kind: SceneKind, t: number, now: number): LiveSession => {
  const scene = CASTS[kind]
  const at = t % LOOP
  const run = Math.floor(t / LOOP)
  const startOfRun = now - at * 1000

  const agents = scene.cast
    .filter(one => at >= one.enters)
    .map(one => {
      const passed = one.steps.filter(step => step.at <= at)
      const last = passed.reduce<Step>((state, step) => ({ ...state, ...step }), { at: 0, status: 'running', activity: 'working', detail: '' })
      const ended = passed.find(step => step.status === 'done' || step.status === 'failed')

      return {
        // Each run's agents are new ones, so they walk in again.
        id: `${one.id}-${run}`,
        seq: scene.cast.indexOf(one),
        name: one.name,
        type: one.type,
        kind: 'subagent',
        status: last.status,
        activity: last.activity,
        detail: last.status === 'running' ? last.detail : '',
        tools: 0,
        startedAt: startOfRun + one.enters * 1000,
        endedAt: ended ? startOfRun + ended.at * 1000 : 0,
        isBackground: false,
        isDemo: true,
        note: last.status === 'failed' ? 'error' : '',
        parentId: one.parentId ? `${one.parentId}-${run}` : undefined,
        files: passed
          .filter(step => step.file)
          .map(step => ({ path: `${CWD}/${step.file}`, isWrite: step.isWrite ?? false, at: startOfRun + step.at * 1000 }))
          .slice(-8),
        trail: passed.filter(step => step.outcome).map(step => step.outcome!).slice(-8),
      }
    })

  const bossSteps = scene.boss.filter(step => step.at <= at)
  const boss = bossSteps.reduce<Step>((state, step) => ({ ...state, ...step }), { at: 0, status: 'working', activity: 'working', detail: '' })

  return {
    id: SCENE_ID,
    label: 'DEMO',
    cwd: CWD,
    updatedAt: now,
    agents,
    boss: {
      status: boss.status === 'running' ? 'working' : boss.status,
      activity: boss.activity,
      detail: boss.detail,
      since: startOfRun + (bossSteps[bossSteps.length - 1]?.at ?? 0) * 1000,
      files: [],
      trail: [],
    },
    usage: { tokens: Math.round(2000 * scene.usage), window: 200_000, percent: scene.usage, usd: scene.usage / 40 },
  }
}
