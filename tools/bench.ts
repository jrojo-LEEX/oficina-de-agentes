// A benchmark of the office's drawing: a full office (six bosses, twelve
// agents) drawn frame after frame by the real Office, each frame timed with
// the GPU's work included (a one-pixel read waits for it). A tool for
// tuning, opened with
// `npx vite --config tools/vite.config.mts` at /bench.html; the app never loads it.

import { drawWhip } from '../src/draw.ts'
import { Office } from '../src/office/office.ts'
import { Whip } from '../src/sim.ts'
import type { Style, Theme } from '../src/office/office.ts'
import type { LiveSession, OficinaAgent } from '../src/office/types.ts'

const FRAMES = 240
const W = 1708
const H = 1020

const agent = (id: string, seq: number, over: Partial<OficinaAgent>): OficinaAgent => ({
  id,
  seq,
  seenAt: 0,
  isListed: true,
  files: [],
  name: id,
  type: ['Explore', 'Plan', 'code-reviewer', 'app-builder', 'general-purpose'][seq % 5]!,
  kind: 'subagent',
  status: 'running',
  activity: (['working', 'reading', 'searching', 'editing', 'tool'] as const)[seq % 5]!,
  detail: '',
  tools: 1,
  startedAt: Date.now() - 60_000 * (seq + 1),
  endedAt: 0,
  isBackground: false,
  isDemo: false,
  note: '',
  trail: ['ok', 'ok', 'err', 'ok'],
  ...over,
})

const sessions = (): LiveSession[] =>
  Array.from({ length: 6 }, (_, s) => ({
    id: `s${s}`,
    label: `proyecto-${s}`,
    boss: { status: s % 2 ? 'idle' : 'working', activity: 'editing', detail: '', since: Date.now() - 100_000 },
    agents: Array.from({ length: 2 }, (_, i) => agent(`a${s}-${i}`, s * 2 + i, i === 1 && s === 2 ? { activity: 'waiting' } : {})),
  }))

const run = (style: Style, theme: Theme) => {
  const canvas = document.createElement('canvas')
  const ratio = devicePixelRatio || 1
  const office = new Office(null)
  office.configure('br', 'm', theme, 'horizontal', false, style)
  office.setSessions(sessions())
  const scratch = document.createElement('canvas')
  let now = Date.now()

  // Settle everyone at their desks first.
  for (let i = 0; i < 120; i++) {
    now += 1000 / 60
    office.layout(W, H)
    office.step(1 / 60, now)
  }

  canvas.width = Math.round(office.width * ratio)
  canvas.height = Math.round(office.height * ratio)
  const ctx = canvas.getContext('2d')!
  const times: number[] = []
  const js: number[] = []
  // Waiting for the GPU without reading the office's own canvas back, which
  // would push it off the GPU: it is copied down to one pixel, and that is read.
  const probe = document.createElement('canvas')
  probe.width = probe.height = 1
  const pctx = probe.getContext('2d', { willReadFrequently: true })!

  for (let i = 0; i < FRAMES; i++) {
    now += 1000 / 60
    office.layout(W, H)
    office.step(1 / 60, now)
    const t0 = performance.now()
    ctx.setTransform(ratio, 0, 0, ratio, -office.x * ratio, -office.y * ratio)
    ctx.clearRect(office.x, office.y, office.width, office.height)
    office.draw(ctx, scratch, false, now)
    const t1 = performance.now()
    pctx.drawImage(canvas, 0, 0, 1, 1)
    pctx.getImageData(0, 0, 1, 1)
    times.push(performance.now() - t0)
    js.push(t1 - t0)
  }

  // Someone new sits down in an office already drawn: only what changed is drawn again.
  const more = sessions()
  more[0]!.agents.push(agent('nuevo', 40, {}))
  office.setSessions(more)
  const before = office.actors.size

  for (let i = 0; i < 120 && office.actors.size === before; i++) {
    now += 1000 / 60
    office.layout(W, H)
    office.step(1 / 60, now)
  }

  const t2 = performance.now()
  ctx.setTransform(ratio, 0, 0, ratio, -office.x * ratio, -office.y * ratio)
  ctx.clearRect(office.x, office.y, office.width, office.height)
  office.draw(ctx, scratch, false, now)
  pctx.drawImage(canvas, 0, 0, 1, 1)
  pctx.getImageData(0, 0, 1, 1)
  const seatChange = performance.now() - t2
  const firstFrame = times[0]!
  times.sort((a, b) => a - b)
  js.sort((a, b) => a - b)
  const q = (list: number[], p: number) => list[Math.floor(p * (list.length - 1))]!.toFixed(2)

  const first = firstFrame
  return `${style.padEnd(9)} ${theme.padEnd(6)} actores=${office.actors.size} primer cuadro=${first.toFixed(1)} · alguien se sienta=${seatChange.toFixed(1)} · total: mediana=${q(times, 0.5)} p90=${q(times, 0.9)} · solo JS: mediana=${q(js, 0.5)} p90=${q(js, 0.9)} ms`
}

/**
 * On the display's own clock, as the app draws: one office frame per screen
 * frame for a few seconds, nothing read back, and how evenly frames came.
 */
const live = (style: Style, theme: Theme, seconds: number) =>
  new Promise<string>(resolve => {
    const canvas = document.createElement('canvas')
    document.body.append(canvas)
    const ratio = devicePixelRatio || 1
    const office = new Office(null)
    office.configure('br', 'm', theme, 'horizontal', false, style)
    office.setSessions(sessions())
    const scratch = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    const gaps: number[] = []
    let last = 0
    let begun = 0
    let now = Date.now()

    const frame = (t: number) => {
      if (begun === 0) begun = t
      if (last) gaps.push(t - last)
      last = t
      now += 1000 / 60
      office.layout(W, H)
      office.step(1 / 60, now)

      if (canvas.width !== Math.round(office.width * ratio)) {
        canvas.width = Math.round(office.width * ratio)
        canvas.height = Math.round(office.height * ratio)
        canvas.style.width = `${office.width / 2}px`
      }

      ctx.setTransform(ratio, 0, 0, ratio, -office.x * ratio, -office.y * ratio)
      ctx.clearRect(office.x, office.y, office.width, office.height)
      office.draw(ctx, scratch, false, now)

      if (t - begun < seconds * 1000) {
        requestAnimationFrame(frame)
        return
      }

      canvas.remove()
      gaps.sort((a, b) => a - b)
      const q = (p: number) => gaps[Math.floor(p * (gaps.length - 1))]!.toFixed(1)
      resolve(`${style.padEnd(9)} ${theme.padEnd(6)} en vivo: ${(gaps.length / seconds).toFixed(0)} cuadros/s · intervalo mediana=${q(0.5)} p99=${q(0.99)} max=${q(1)} ms`)
    }

    requestAnimationFrame(frame)
  })

/** The whip swung across a full-screen canvas, as the overlay draws it every frame. */
const whipRun = (glow: number) => {
  const canvas = document.createElement('canvas')
  const ratio = devicePixelRatio || 1
  canvas.width = Math.round(W * ratio)
  canvas.height = Math.round(H * ratio)
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  const whip = new Whip(W / 2, H / 3)
  const probe = document.createElement('canvas')
  probe.width = probe.height = 1
  const pctx = probe.getContext('2d', { willReadFrequently: true })!
  const times: number[] = []

  for (let i = 0; i < FRAMES; i++) {
    const a = i / 20
    whip.setTarget(W / 2 + Math.cos(a) * 300, H / 3 + Math.sin(a * 1.7) * 200)
    whip.advance(1 / 60, () => {})
    const t0 = performance.now()
    ctx.clearRect(0, 0, W, H)
    drawWhip(ctx, whip, glow)
    pctx.drawImage(canvas, 0, 0, 1, 1)
    pctx.getImageData(0, 0, 1, 1)
    times.push(performance.now() - t0)
  }

  times.sort((x, y) => x - y)
  const q = (p: number) => times[Math.floor(p * (times.length - 1))]!.toFixed(2)

  return `látigo    brillo=${glow}  pantalla completa: mediana=${q(0.5)} p90=${q(0.9)} ms`
}

const out = document.getElementById('out')!
const lines: string[] = []
const cases = [['pixel', 'party'], ['ilustrado', 'normal'], ['ilustrado', 'night'], ['ilustrado', 'party']] as [Style, Theme][]
const isLive = new URLSearchParams(location.search).has('vivo')
for (const [style, theme] of cases) {
  lines.push(isLive ? await live(style, theme, 3) : run(style, theme))
  out.textContent = lines.join('\n')
}

lines.push(whipRun(0), whipRun(0.8))
out.textContent = lines.join('\n') + '\nlisto'
