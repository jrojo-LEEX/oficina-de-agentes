// Style frames: one fixed office scene drawn by the real Office in every
// style, side by side, to compare them. A tool for tuning the look, opened
// with `npx vite --config tools/vite.config.mts` at /styleframes.html; the app never loads it.

import { Office } from '../src/office/office.ts'
import type { Style, Theme } from '../src/office/office.ts'
import type { LiveSession, OficinaAgent } from '../src/office/types.ts'

const FPS = 60
const W = 780
const H = 420

const agent = (id: string, seq: number, over: Partial<OficinaAgent>): OficinaAgent => ({
  id,
  seq,
  seenAt: 0,
  isListed: true,
  files: [],
  trail: [],
  name: id,
  type: 'general-purpose',
  kind: 'subagent',
  status: 'running',
  activity: 'working',
  detail: '',
  tools: 1,
  startedAt: Date.now() - 60_000 * (seq + 1),
  endedAt: 0,
  isBackground: false,
  isDemo: false,
  note: '',
  ...over,
})

const scene = (isDone: boolean): LiveSession[] => [
  {
    id: 's1',
    label: 'mi-proyecto',
    boss: { status: 'working', activity: 'editing', detail: 'Edit office.ts', since: Date.now() - 300_000 },
    agents: [
      agent('Explora rutas', 1, { type: 'Explore', activity: 'reading', trail: ['ok', 'ok', 'err', 'ok'] }),
      agent('Plan del motor', 2, { type: 'Plan', activity: 'searching' }),
      agent('Revisor', 3, { type: 'code-reviewer', activity: 'waiting', parentId: undefined }),
      agent('app-builder', 4, { type: 'app-builder', activity: 'editing', trail: ['ok', 'ok', 'ok'] }),
      agent('Golpeado', 5, { type: 'general-purpose', activity: 'tool' }),
      agent('Terminó', 6, { type: 'general-purpose', activity: 'tool', ...(isDone ? { status: 'done', endedAt: Date.now() } : {}) }),
      agent('Falló', 7, { type: 'security-auditor', status: 'failed', endedAt: Date.now(), note: 'error' }),
    ],
  },
]

/** `?f=2&z=2.5`: only the third frame, magnified, to look at the detail. */
const query = new URLSearchParams(location.search)
const zoom = Number(query.get('z') ?? 1)
const only = query.get('f')

const frame = (style: Style, theme: Theme, title: string) => {
  const figure = document.createElement('figure')
  const canvas = document.createElement('canvas')
  const ratio = (devicePixelRatio || 1) * zoom
  canvas.width = W * ratio
  canvas.height = H * ratio
  canvas.style.width = `${W * zoom}px`
  canvas.style.height = `${H * zoom}px`
  const caption = document.createElement('figcaption')
  caption.textContent = title
  figure.append(caption, canvas)
  document.getElementById('frames')!.append(figure)

  const office = new Office(null)
  office.configure('br', 'm', theme, 'horizontal', false, style)
  office.setSessions(scene(false))
  const scratch = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  let now = Date.now()

  const run = (seconds: number) => {
    for (let i = 0; i < seconds * FPS; i++) {
      now += 1000 / FPS
      office.layout(W, H)
      office.step(1 / FPS, now)
      // Drawn every frame, so the eased poses catch up as they would on screen.
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      ctx.clearRect(0, 0, W, H)
      office.draw(ctx, scratch, false, now)
    }
  }

  run(1.5)
  office.setSessions(scene(true))
  run(0.4)
  office.hit('s1:Golpeado', 9000, 1, true)
  run(0.75)
}

const frames: [Style, Theme, string][] = [
  ['ilustrado', 'normal', 'Ilustrado · de día'],
  ['ilustrado', 'night', 'Ilustrado · de noche'],
  ['ilustrado', 'party', 'Ilustrado · un viernes'],
  ['pixel', 'normal', 'Antes · pixel art'],
]

frames.forEach(([style, theme, title], index) => {
  if (only === null || Number(only) === index) frame(style, theme, title)
})

if (only !== null) document.getElementById('frames')!.style.display = 'block'
