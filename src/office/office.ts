// The office on the desktop: each live Claude Code session's own Claude (the
// boss, at a big desk) and its real agents, as little Claudes at their desks
// in a corner of the screen, where the whip can reach them. It knows nothing
// of the window or the mouse, so a test can drive it directly.

import { advance, isWary, poseOf, seat, strike } from './actors.ts'
import type { Actor, Pose, ReactionKind } from './actors.ts'
import * as art from './illustration.ts'
import type { Shown } from './illustration.ts'
import { PALETTE, Pixels } from './pixels.ts'
import { ACCENTS, C } from './pixels.ts'
import { Props } from './props.ts'
import type { PropBox } from './props.ts'
import { bodyBox, drawActor, drawBossDesk, drawDesk } from './sprites.ts'
import type { Look } from './sprites.ts'
import type { Stats } from './stats.ts'
import { t } from '../i18n.ts'
import { freshOf, money, shortTime, shortTokens } from '../spend.ts'
import type { SpendSession } from '../spend.ts'
import type { LiveSession, OficinaActivity, OficinaAgent, Outcome, UsageState } from './types.ts'

export type Corner = 'br' | 'bl' | 'tr' | 'tl'
export type Size = 's' | 'm' | 'l'
/** `auto`: night from 20 to 7, party on Fridays, plain otherwise. */
export type Theme = 'auto' | 'normal' | 'night' | 'party'
/** Horizontal rows, a tower of floors two desks wide, or two wings with a corridor. */
export type Layout = 'horizontal' | 'tower' | 'wings'
/** Drawn as flat illustration in Claude's warm colours, or as the original pixel art. */
export type Style = 'ilustrado' | 'pixel'
/** How fast a drawn pose catches up with the real one, per second: quick, but never a jump. */
const EASE_RATE = 26

/** Desks per row, by layout; the office always holds the same twelve. */
const COLS_OF: Record<Layout, number> = { horizontal: 6, tower: 2, wings: 6 }
/** Office pixels of corridor between the wings, after this many columns. */
const CORRIDOR = 6
const WING = 3

/** A session silent this long is shown as disconnected (it writes every four seconds). */
export const STALE_LINK_MS = 12_000
/** Two agents writing the same file within this long are flagged. */
const SHARED_MS = 10 * 60_000
/** The folder map counts the files touched this long back. */
const MAP_MS = 30 * 60_000

/** One path, spelled one way, whatever the slashes and the case. */
export const normalPath = (path: string) => path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

const baseName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path

/** Where a role prefers to sit: a start slot, searched onward. */
export const roleOf = (agent: { type: string; name: string }) =>
  agent.type === 'Explore'
    ? 'explore'
    : /revi[se]|review/i.test(`${agent.type} ${agent.name}`)
      ? 'review'
      : /test|prueba|qa\b/i.test(`${agent.type} ${agent.name}`)
        ? 'test'
        : agent.type === 'Plan'
          ? 'plan'
          : 'build'

const ROLE_START: Record<ReturnType<typeof roleOf>, number> = { explore: 2, plan: 3, build: 4, review: 7, test: 9 }

/** The theme a moment calls for. */
export const themeAt = (theme: Theme, date: Date): Exclude<Theme, 'auto'> => {
  if (theme !== 'auto') return theme

  const hour = date.getHours()

  if (hour >= 20 || hour < 7) return 'night'

  return date.getDay() === 5 ? 'party' : 'normal'
}

/** A context this full makes the boss sweat. */
const SWEATY_PERCENT = 80

/** What each kind of agent wears. */
export const lookOf = (agent: { type: string; name: string }): Look =>
  agent.type === 'Explore'
    ? 'explorer'
    : agent.type === 'Plan'
      ? 'plans'
      : /revi[se]|review/i.test(`${agent.type} ${agent.name}`)
        ? 'glasses'
        : null

const thousands = (tokens: number) => (tokens >= 1000 ? `${Math.round(tokens / 1000)}k` : String(tokens))

/** Screen pixels per office pixel, by size: the pixel art, scaled up crisp. */
export const SCALES: Record<Size, number> = { s: 4, m: 6, l: 8 }
/** Office pixels: a desk's width, a row of desks' height, where the feet rest in it. */
export const SLOT_W = 20
export const BAND_H = 24
const FEET = 15
/** Desks per row and rows: the usual floor. */
export const COLS = 6
export const ROWS = 2
/**
 * Desks the office grows to, a row at a time and only as far as the screen
 * holds, when the usual floor is full: each boss takes two, so a handful of
 * live sessions alone would fill it. Past this, the rest wait in the hall.
 */
export const MAX_DESKS = 36
/** Screen pixels: the title line, the tally line, the padding, the gap to the screen's edge. */
const TITLE_H = 22
const FOOTER_H = 40
const PAD = 10
const MARGIN = 18
/** Office pixels added around a body for the whip: a lash that grazes the outline counts. */
const HIT_MARGIN = 2
/** A failed agent found this long after it ended is not given a desk. */
const STALE_MS = 15000
/**
 * The whip's speeds are in screen pixels; a character's reactions were
 * tuned in the mod's office pixels, where the whip is this many times smaller.
 */
export const SPEED_SCALE = 12.5 / 1.15

export type Box = { id: string; x0: number; y0: number; x1: number; y1: number }

const pad2 = (n: number) => String(n).padStart(2, '0')

export const elapsedOf = (agent: OficinaAgent, now: number) => {
  if (agent.startedAt === 0) return '--:--'

  const seconds = Math.max(0, Math.floor(((agent.endedAt || now) - agent.startedAt) / 1000))

  return `${pad2(Math.floor(seconds / 60))}:${pad2(seconds % 60)}`
}

/** What an agent at work can be doing; each one's words are `activity.*`. */
const ACTIVITIES = new Set<string>(['working', 'reading', 'searching', 'editing', 'tool', 'waiting'] satisfies OficinaActivity[])

/** An agent's name, or its type, or just "agent". */
const nameOf = (agent: { name: string; type: string }) => agent.name || agent.type || t('office.agent')

/** One agent of one session, under a key no other session's agent can share. */
type Seated = OficinaAgent & { key: string; session: string; sessionId: string; isBoss: boolean; usage?: UsageState | null }

type SessionInfo = { label: string; cwd: string; updatedAt: number }

export const stateOf = (agent: Seated) =>
  agent.isBoss && agent.status === 'idle'
    ? t('status.bossIdle')
    : agent.status === 'running'
      ? t(ACTIVITIES.has(agent.activity) ? `activity.${agent.activity}` : 'activity.working')
      : agent.status === 'idle'
        ? t('status.idle')
        : agent.status === 'done'
          ? t('status.done')
          : agent.status === 'failed'
            ? agent.note
              ? t('status.failedWith', { note: agent.note })
              : t('status.failed')
            : t('status.unknown')

/** An agent's status in a word, for lists: working, on hold, finished, failed, no data. */
export const statusWord = (status: string) => t(`status.${status}`, { defaultValue: status })

/** A live session's own Claude, as a list says it: working, waiting for permission, or waiting for you. */
export const bossStateOf = (status: string) =>
  status === 'working' ? t('status.running') : status === 'waiting' ? t('activity.waiting') : status === 'idle' ? t('status.bossIdle') : t('status.unknown')

/** The session's own Claude as an agent the office can seat: never finishes, only goes. */
const bossOf = (session: LiveSession): Seated | null => {
  const boss = session.boss

  if (!boss || typeof boss !== 'object' || typeof boss.status !== 'string') {
    return null
  }

  const activity = boss.status === 'waiting' ? 'waiting' : ACTIVITIES.has(boss.activity) ? (boss.activity as OficinaActivity) : 'working'

  return {
    id: 'boss',
    seq: 0,
    name: session.label ? `Claude · ${session.label}` : 'Claude',
    type: t('office.bossType'),
    kind: 'subagent',
    status: boss.status === 'idle' ? 'idle' : 'running',
    activity,
    detail: typeof boss.detail === 'string' ? boss.detail : '',
    tools: 0,
    startedAt: typeof boss.since === 'number' ? boss.since : 0,
    endedAt: 0,
    seenAt: typeof boss.since === 'number' ? boss.since : 0,
    isListed: true,
    isBackground: false,
    isDemo: false,
    note: '',
    key: `${session.id}:boss`,
    session: session.label,
    sessionId: session.id,
    isBoss: true,
    usage: session.usage && typeof session.usage === 'object' ? session.usage : null,
    files: Array.isArray(boss.files) ? boss.files : [],
    trail: Array.isArray(boss.trail) ? boss.trail : [],
  }
}

export class Office {
  readonly pixels = new Pixels()
  readonly actors = new Map<string, Actor>()
  /** The cups, pencils and folders on the desks, and the robot that tidies them. */
  readonly props = new Props()
  /** Agents whose character already walked out: never seated again unless seen working. */
  private readonly gone = new Set<string>()
  private readonly stats: Stats | null
  private agents: Seated[] = []
  private sessions = 0
  private sessionInfo = new Map<string, SessionInfo>()
  /** Each session's time and tokens so far, from the transcripts. */
  private spend = new Map<string, { activeMs: number; tokens: number; cacheRead: number }>()
  /** Fewer things moving: the office stops fidgeting and the party lights hold still. */
  isCalm = false
  layoutKind: Layout = 'horizontal'
  style: Style = 'ilustrado'
  /** Each character's pose as last drawn, eased toward the real one. */
  private readonly shown = new Map<string, Shown & { at: number }>()
  private easing = false
  /** Characters and screens as GPU bitmaps, by what they show. */
  private readonly sprites = new art.Sprites(360)
  /** Seconds of office time. */
  clock = 0
  isPaused = false
  corner: Corner = 'br'
  scale = SCALES.m
  theme: Theme = 'auto'
  /** The office's top left corner on screen, and its size, in screen pixels. */
  x = 0
  y = 0
  width = 0
  height = 0

  /** The whip is in hand: only then do the hit counts show, in the card and the footer. */
  isWhipOn = true

  constructor(stats: Stats | null = null) {
    this.stats = stats
  }

  configure(corner: Corner, size: Size, theme: Theme = 'auto', layout: Layout = 'horizontal', isCalm = false, style: Style = this.style) {
    this.corner = corner
    this.style = style
    this.scale = SCALES[size] ?? SCALES.m
    this.theme = theme
    this.isCalm = isCalm

    if (layout !== this.layoutKind && COLS_OF[layout]) {
      // A new floor plan: everyone takes a desk in it again.
      this.layoutKind = layout
      this.actors.clear()
      this.gone.clear()
    }
  }

  /** Desks per row in the current layout. */
  get cols() {
    return COLS_OF[this.layoutKind]
  }

  /** How long, in ms, a session has not written; 0 for one unknown. */
  silenceOf(sessionId: string, now: number) {
    const info = this.sessionInfo.get(sessionId)

    return info && info.updatedAt > 0 ? Math.max(0, now - info.updatedAt) : 0
  }

  /** Sessions whose data is getting old: they may have stopped writing. */
  staleSessions(now: number) {
    return [...this.sessionInfo.keys()].filter(id => this.silenceOf(id, now) > STALE_LINK_MS)
  }

  /** For each agent writing a file another agent also wrote lately: who, and which file. */
  sharedFiles(now: number): Map<string, { other: string; file: string }> {
    const writers = new Map<string, { key: string; name: string; path: string }[]>()

    for (const agent of this.agents) {
      for (const touch of agent.files ?? []) {
        if (!touch.isWrite || now - touch.at > SHARED_MS) continue

        const path = normalPath(touch.path)
        const list = writers.get(path) ?? []

        if (!list.some(one => one.key === agent.key)) list.push({ key: agent.key, name: nameOf(agent), path: touch.path })
        writers.set(path, list)
      }
    }

    const shared = new Map<string, { other: string; file: string }>()

    for (const list of writers.values()) {
      if (list.length < 2) continue

      for (const one of list) {
        const other = list.find(two => two.key !== one.key)!
        shared.set(one.key, { other: other.name, file: baseName(one.path) })
      }
    }

    return shared
  }

  /** Which folders of each session's project saw the most files touched lately, most first. */
  folderMap(now: number): { folder: string; count: number }[] {
    const counts = new Map<string, number>()

    for (const agent of this.agents) {
      const cwd = normalPath(this.sessionInfo.get(agent.sessionId)?.cwd ?? '')

      for (const touch of agent.files ?? []) {
        if (now - touch.at > MAP_MS) continue

        const path = normalPath(touch.path)
        const inside = cwd && path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : null
        const parts = inside ? inside.split('/') : []
        const folder = inside === null ? t('office.outside') : parts.length > 1 ? parts[0]! : t('office.root')
        counts.set(folder, (counts.get(folder) ?? 0) + 1)
      }
    }

    return [...counts.entries()].map(([folder, count]) => ({ folder, count })).sort((a, b) => b.count - a.count)
  }

  /** The account's rate-limit windows, as last reported. */
  private limits: { kind: string; percentUsed: number }[] = []

  setLimits(limits: { kind: string; percentUsed: number }[]) {
    this.limits = limits
  }

  /** The 5-hour window's use, 0 when unknown. */
  get fiveHourUse() {
    return this.limits.find(one => one.kind === 'five_hour')?.percentUsed ?? 0
  }

  /** Takes in the time and tokens each session has spent so far. */
  setSpend(sessions: SpendSession[]) {
    this.spend = new Map(
      sessions.map(session => {
        const days = Object.values(session.days)

        return [
          session.id,
          {
            activeMs: days.reduce((sum, day) => sum + day.activeMs, 0),
            tokens: days.reduce((sum, day) => sum + freshOf(day), 0),
            cacheRead: days.reduce((sum, day) => sum + day.cacheRead, 0),
          },
        ]
      }),
    )
  }

  /** The keys of everyone waiting on the person right now. */
  waitingKeys(): Set<string> {
    return new Set(this.agents.filter(agent => !agent.isDemo && agent.status === 'running' && agent.activity === 'waiting').map(agent => agent.key))
  }

  /** The real agents (no boss, no demo) as they stand: what the day's report keeps. */
  roster() {
    return this.agents.filter(agent => !agent.isBoss && !agent.isDemo)
  }

  /** The agents and bosses of every live session, as the main process last read them. */
  setSessions(sessions: LiveSession[]) {
    this.sessions = sessions.length
    this.sessionInfo = new Map(
      sessions.map(session => [
        session.id,
        { label: session.label, cwd: typeof session.cwd === 'string' ? session.cwd : '', updatedAt: typeof session.updatedAt === 'number' ? session.updatedAt : 0 },
      ]),
    )
    // Written by the mod, read off disk: anything without an id is skipped.
    this.agents = sessions.flatMap(session => {
      const boss = bossOf(session)
      const agents = (Array.isArray(session.agents) ? session.agents : [])
        .filter(agent => typeof agent === 'object' && agent !== null && typeof agent.id === 'string')
        .map(agent => ({ ...agent, key: `${session.id}:${agent.id}`, session: session.label, sessionId: session.id, isBoss: false }))

      return boss ? [boss, ...agents] : agents
    })
  }

  private agentOf(key: string) {
    return this.agents.find(agent => agent.key === key)
  }

  /** Rows of desks the screen holds at this scale, as the last layout found. */
  private rowsFit = 0

  get capacity() {
    const usual = Math.ceil((COLS * ROWS) / this.cols)
    const most = Math.ceil(MAX_DESKS / this.cols)

    return this.cols * Math.max(usual, Math.min(most, this.rowsFit))
  }

  /** The actor's parent at its desk: the agent that spawned it, or its session's boss. */
  private parentOf(actor: Actor): Actor | null {
    const agent = this.agentOf(actor.id)

    if (!agent || agent.isBoss) return null

    return this.actors.get(agent.parentId ? `${agent.sessionId}:${agent.parentId}` : `${agent.sessionId}:boss`) ?? null
  }

  /** Whether there is anything to draw. */
  get isShown() {
    return this.actors.size > 0
  }

  /** Whether anyone in the office waits on the person: the frame pulses. */
  get isAnyoneWaiting() {
    return [...this.actors.keys()].some(key => {
      const agent = this.agentOf(key)

      return agent?.status === 'running' && agent.activity === 'waiting'
    })
  }

  /** A boss takes its desk and the one beside it. */
  private slotsOf(actor: Actor) {
    return actor.id.endsWith(':boss') ? [actor.slot, actor.slot + 1] : [actor.slot]
  }

  /** Lays the office out in its corner of a screen this size. */
  layout(screenWidth: number, screenHeight: number) {
    this.rowsFit = Math.floor((screenHeight - 2 * MARGIN - 2 * PAD - TITLE_H - FOOTER_H) / (BAND_H * this.scale))
    let cols = 1
    let rows = 1

    for (const actor of this.actors.values()) {
      for (const slot of this.slotsOf(actor)) {
        cols = Math.max(cols, (slot % this.cols) + 1)
        rows = Math.max(rows, Math.floor(slot / this.cols) + 1)
      }
    }

    const corridor = this.layoutKind === 'wings' && cols > WING ? CORRIDOR : 0
    this.pixels.resize(cols * SLOT_W + corridor, rows * BAND_H)
    this.width = this.pixels.width * this.scale + 2 * PAD
    this.height = this.pixels.height * this.scale + TITLE_H + FOOTER_H + 2 * PAD
    this.x = this.corner.endsWith('l') ? MARGIN : screenWidth - this.width - MARGIN
    this.y = this.corner.startsWith('t') ? MARGIN : screenHeight - this.height - MARGIN
  }

  /** Where a desk's office pixels start on screen. */
  private originX() {
    return this.x + PAD
  }

  private originY() {
    return this.y + PAD + TITLE_H
  }

  private placeOf(slot: number) {
    if (slot >= this.capacity) return null

    const col = slot % this.cols
    const corridor = this.layoutKind === 'wings' && col >= WING ? CORRIDOR : 0

    return { x: col * SLOT_W + corridor, feet: Math.floor(slot / this.cols) * BAND_H + FEET }
  }

  /**
   * Gives every agent worth showing a character at a free desk. Bosses with
   * something going on come first, at a double desk; then the agents; last,
   * the bosses of sessions that wait on the person with nobody working, so
   * those never keep the agents out.
   */
  private seatAgents(now: number) {
    const taken = new Set<number>()

    for (const actor of this.actors.values()) for (const slot of this.slotsOf(actor)) taken.add(slot)

    const busy = new Set(
      this.agents.filter(agent => !agent.isBoss && (agent.status === 'running' || agent.status === 'idle')).map(agent => agent.sessionId),
    )
    const rank = (agent: Seated) => (!agent.isBoss ? 1 : agent.status === 'running' || busy.has(agent.sessionId) ? 0 : 2)
    const waiting = [...this.agents].sort((a, b) => rank(a) - rank(b) || a.startedAt - b.startedAt || a.seq - b.seq)
    const hall: Seated[] = []

    for (const agent of waiting) {
      if (this.actors.has(agent.key)) continue

      const isLive = agent.status === 'running' || agent.status === 'idle' || agent.status === 'unknown'

      if (this.gone.has(agent.key)) {
        if (agent.status !== 'running' && agent.status !== 'idle') continue

        this.gone.delete(agent.key)
      }

      const isFreshFailure = agent.status === 'failed' && now - agent.endedAt < STALE_MS

      if (!isLive && !isFreshFailure) {
        // It finished before it could be seen at a desk: only the count shows it.
        this.gone.add(agent.key)
        continue
      }

      let slot = 0

      if (agent.isBoss) {
        // Two free desks side by side, in one row (and one wing).
        const isSplit = (at: number) => at % this.cols === this.cols - 1 || (this.layoutKind === 'wings' && at % this.cols === WING - 1)
        while (slot < this.capacity && (taken.has(slot) || taken.has(slot + 1) || isSplit(slot))) slot += 1
      } else {
        // Each role keeps to its part of the office, so it is found where it was last time.
        const start = ROLE_START[roleOf(agent)] % this.capacity
        const free = Array.from({ length: this.capacity }, (_, i) => (start + i) % this.capacity).find(at => !taken.has(at))
        slot = free ?? this.capacity
      }

      // A full office: the rest wait in the hall until a desk frees up.
      if (slot >= this.capacity) {
        // A boss with nobody working is no loss in the hall; anyone else is.
        if (isLive && rank(agent) < 2) hall.push(agent)

        continue
      }

      taken.add(slot)
      if (agent.isBoss) taken.add(slot + 1)
      this.actors.set(agent.key, { ...seat(agent, slot), id: agent.key })
    }

    this.hall = hall.length

    for (const id of this.makingRoom) {
      if (!this.actors.has(id)) this.makingRoom.delete(id)
    }

    // Someone working waits in the hall while a boss whose session has nobody
    // working holds a double desk: that boss steps out, one at a time, and
    // comes back when there is room or its session gets going again.
    if (hall.length > 0 && this.makingRoom.size === 0) {
      const idler = [...this.actors.values()]
        .filter(actor => {
          const agent = this.agentOf(actor.id)

          return agent?.isBoss && rank(agent) === 2 && actor.leave < 0 && actor.reaction === null
        })
        .sort((a, b) => b.slot - a.slot)[0]

      if (idler) {
        idler.leave = 0
        this.makingRoom.add(idler.id)
      }
    }
  }

  /** How many with something going on wait in the hall for a desk: the title says so. */
  hall = 0
  /** Bosses walking out to make room for someone working. */
  private readonly makingRoom = new Set<string>()

  private poseFor(actor: Actor, isWhipHeld: boolean): Pose {
    const agent = this.agentOf(actor.id)
    const pose = poseOf(actor, agent, this.clock, !this.isPaused && !this.isCalm)

    // A boss whose context is nearly full, or whose 5-hour limit nearly ran out, sweats over it.
    if (agent?.isBoss && ((agent.usage?.percent ?? 0) >= SWEATY_PERCENT || this.fiveHourUse >= 90) && !pose.isFlat) {
      pose.hasSweat = true
    }

    // A character that was hit lately keeps an eye on a whip in someone's hand.
    if (isWhipHeld && actor.reaction === null && pose.eyes === 'open' && isWary(actor, this.clock)) {
      pose.eyes = 'wide'
    }

    return pose
  }

  /**
   * Moves the office on by `dt` seconds; `now` is epoch ms. Returns whether
   * someone is in a moment (a reaction, a walk, a celebration) that wants
   * every frame drawn; otherwise a few frames a second will do.
   */
  step(dt: number, now: number): boolean {
    this.clock += dt
    this.seatAgents(now)
    let isBusy = false

    const desks = [...this.actors.values()].flatMap(actor => {
      const place = this.placeOf(actor.slot)

      return place ? [{ slot: actor.slot, x: place.x, feet: place.feet, isBoss: actor.id.endsWith(':boss') }] : []
    })
    this.props.sync(desks, this.pixels.width)
    this.props.step(dt)
    isBusy = this.props.isBusy

    for (const actor of [...this.actors.values()]) {
      const agent = this.agentOf(actor.id)
      isBusy = advance(actor, agent, dt) || isBusy

      if (actor.isGone) {
        this.actors.delete(actor.id)

        if (agent) this.gone.add(actor.id)
      }
    }

    return isBusy
  }

  /** Every seated body, in screen pixels: what the whip can hit, and what the pointer points at. */
  boxes(isWhipHeld = false, margin = HIT_MARGIN): Box[] {
    const boxes: Box[] = []
    const ox = this.originX()
    const oy = this.originY()
    const s = this.scale

    for (const actor of this.actors.values()) {
      const place = this.placeOf(actor.slot)

      if (!place) continue

      const body = bodyBox(place.x + 2, place.feet, this.poseFor(actor, isWhipHeld))
      boxes.push({
        id: actor.id,
        x0: ox + (body.x0 - margin) * s,
        y0: oy + (body.y0 - margin) * s,
        x1: ox + (body.x1 + 1 + margin) * s,
        y1: oy + (body.y1 + 1 + margin) * s,
      })
    }

    return boxes
  }

  /** The props on the desks, in screen pixels: the whip knocks these over. */
  propBoxes(): PropBox[] {
    return this.props.boxes(this.originX(), this.originY(), this.scale)
  }

  /** The whip knocked a prop at `speed` screen pixels a second. */
  hitProp(id: string, speed: number, dir: 1 | -1) {
    return this.props.hit(id, speed / this.scale, dir)
  }

  /** The thong's tip on screen, its velocity and whether a hand holds the whip: hooks and flings props. */
  hookTip(x: number, y: number, vx: number, vy: number, isHeld: boolean) {
    const s = this.scale
    this.props.hook((x - this.originX()) / s, (y - this.originY()) / s, vx / s, vy / s, isHeld)
  }

  /** Where the office's pixels start on screen. */
  pixelOrigin() {
    return { x: this.originX(), y: this.originY() }
  }

  /**
   * One frame of film, as the office was last painted: its pixels, the names
   * under the desks and the whip's points (screen pixels from the pixel
   * origin). What each agent was doing, its files and its session stay out.
   */
  filmFrame(now: number, whip: number[]) {
    // Film keeps the pixel grid: the illustration only paints it when a frame is taken.
    if (this.style !== 'pixel') this.paint(false, now)

    const s = this.scale
    const small = Math.max(10, Math.round(s * 2.1))
    const labels: { text: string; x: number; y: number; color: string; size: number }[] = []

    for (const mark of this.pixels.marks) {
      labels.push({ text: mark.text, x: mark.x * s, y: mark.y * s, color: PALETTE[mark.color] || '#F5F0E6', size: Math.round(s * 3.3) })
    }

    for (const actor of this.actors.values()) {
      const place = this.placeOf(actor.slot)
      const agent = this.agentOf(actor.id)

      if (!place || !agent) continue

      const span = agent.isBoss ? 2 * SLOT_W : SLOT_W
      const x = (place.x + span / 2) * s
      const y = (place.feet + 4) * s
      labels.push({ text: agent.isBoss ? 'Claude' : nameOf(agent).slice(0, 16), x, y, color: agent.isBoss ? '#F5C542' : '#F5F0E6', size: small })
      labels.push({ text: agent.isBoss ? stateOf(agent) : elapsedOf(agent, now), x, y: y + small + 3, color: '#9AA0AA', size: small })
    }

    const count = this.tally()

    return {
      t: now,
      w: this.pixels.width,
      h: this.pixels.height,
      px: this.pixels.snapshot(),
      scale: s,
      title: [t('office.title'), t('office.active', { count: count.active }), count.done ? t('office.done', { count: count.done }) : '', count.isDemo ? 'DEMO' : '']
        .filter(Boolean)
        .join(' · '),
      labels,
      whip,
    }
  }

  /** The character under a point on screen, or null. */
  actorAt(x: number, y: number): string | null {
    const hit = this.boxes(false, 1).find(box => x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1)

    return hit?.id ?? null
  }

  /**
   * The whip struck a character at `speed` screen pixels a second; a
   * critical is a cracking tip landing right on it. Returns its reaction, or null.
   */
  hit(id: string, speed: number, dir: 1 | -1, isCritical = false): ReactionKind | null {
    const actor = this.actors.get(id)
    const kind = actor ? strike(actor, speed / SPEED_SCALE, dir, this.clock, isCritical) : null

    if (!actor || !kind || kind === 'dodge') {
      return kind
    }

    const agent = this.agentOf(id)
    this.stats?.record(agent ? nameOf(agent) : t('office.agent'), isCritical)

    if (id.endsWith(':boss')) {
      // The boss got it: its own agents cheer.
      const session = id.slice(0, -':boss'.length)

      for (const other of this.actors.values()) {
        if (other.id !== id && other.id.startsWith(`${session}:`) && other.reaction === null) {
          other.glee = 1.6
          other.gleeKind = 'cheer'
        }
      }
    } else {
      // The desks beside it giggle; a boss's double desk counts by its right half.
      const row = Math.floor(actor.slot / this.cols)

      for (const other of this.actors.values()) {
        const right = other.id.endsWith(':boss') ? other.slot + 1 : other.slot
        const isBeside =
          Math.floor(other.slot / this.cols) === row && (other.slot === actor.slot + 1 || right === actor.slot - 1)

        if (other.id !== id && isBeside && other.reaction === null) {
          other.glee = 1.2
          other.gleeKind = 'laugh'
        }
      }
    }

    return kind
  }

  /** The tally the title line shows. */
  tally() {
    const shown = this.agents.filter(agent => !agent.isBoss)

    return {
      active: shown.filter(agent => agent.status === 'running' || agent.status === 'idle').length,
      waiting: this.agents.filter(agent => agent.status === 'running' && agent.activity === 'waiting').length,
      done: shown.filter(agent => agent.status === 'done').length,
      failed: shown.filter(agent => agent.status === 'failed').length,
      isDemo: shown.some(agent => agent.isDemo),
      sessions: this.sessions,
    }
  }

  /** What the pointer shows over a character: who it is and what it is doing. */
  tooltipOf(key: string, now: number): string[] {
    const agent = this.agentOf(key)

    if (!agent) return []

    const lines = [nameOf(agent), `${agent.type || t('office.unknownType')} · ${stateOf(agent)}`]

    if (agent.detail) lines.push(agent.detail)

    if (agent.isBoss && agent.usage) {
      const { percent, tokens, usd } = agent.usage
      const full = percent >= SWEATY_PERCENT ? ` · ${t('tooltip.nearlyFull')}` : ''
      lines.push(`${t('tooltip.context', { percent, tokens: thousands(tokens) })}${usd > 0 ? ` · ${money(usd)}` : ''}${full}`)
    }

    lines.push(`${t(agent.isBoss ? 'tooltip.bossFor' : 'tooltip.agentFor', { time: elapsedOf(agent, now) })}${agent.session && !agent.isBoss ? ` · ${agent.session}` : ''}`)

    const spent = agent.isBoss ? this.spend.get(agent.sessionId) : undefined

    if (spent) {
      lines.push(t('tooltip.session', { time: shortTime(spent.activeMs), fresh: shortTokens(spent.tokens), cache: shortTokens(spent.cacheRead) }))
    }

    const silence = this.silenceOf(agent.sessionId, now)

    if (silence > STALE_LINK_MS) {
      lines.push(t('tooltip.stale', { seconds: Math.round(silence / 1000) }))
    }

    const parent = this.actors.get(key) ? this.parentOf(this.actors.get(key)!) : null
    const parentAgent = parent ? this.agentOf(parent.id) : undefined

    if (parentAgent) lines.push(t('tooltip.launchedBy', { name: parentAgent.isBoss ? t('tooltip.theBoss') : nameOf(parentAgent) }))

    const shared = this.sharedFiles(now).get(key)

    if (shared) lines.push(t('tooltip.shared', { other: shared.other, file: shared.file }))

    const trail = (agent.trail ?? []).slice(-6)

    if (trail.length > 0) {
      const marks = trail.map(one => (one === 'ok' ? '✓' : '✗')).join(' ')
      lines.push(t(trail[trail.length - 1] === 'ok' ? 'tooltip.toolsOk' : 'tooltip.toolsBad', { marks }))
    }

    if (this.stats && this.isWhipOn) lines.push(t('tooltip.hitsMonth', { count: this.stats.monthOf(nameOf(agent)) }))

    return lines
  }

  /** Paints the office pixels: desks and characters, nothing on screen yet. */
  paint(isWhipHeld: boolean, now = Date.now()) {
    const c = this.pixels
    c.clear()
    const shared = this.sharedFiles(now)

    if (this.layoutKind === 'wings' && c.width > WING * SLOT_W) {
      // The corridor between the wings: a strip of carpet.
      for (let y = 2; y < c.height; y += 2) c.set(WING * SLOT_W + CORRIDOR / 2, y, C.deskShade)
    }

    for (const actor of this.actors.values()) {
      const place = this.placeOf(actor.slot)

      if (!place) continue

      const agent = this.agentOf(actor.id)
      const isBoss = actor.id.endsWith(':boss')
      const t = this.isPaused ? 0 : this.clock
      const desk = isBoss ? drawBossDesk : drawDesk
      desk(c, place.x + 1, place.feet, agent, t, actor.seq)

      if (this.mood === 'night') {
        // A desk lamp, lit.
        const lx = place.x + (isBoss ? 37 : 19)
        c.rect(lx, place.feet - 7, 1, 3, C.grey)
        c.rect(lx - 2, place.feet - 8, 3, 1, C.grey)
        c.rect(lx - 2, place.feet - 7, 2, 1, C.yellow)
      }

      drawActor(c, place.x + 2, place.feet, this.poseFor(actor, isWhipHeld), actor.seq, this.clock, isBoss, agent ? lookOf(agent) : null)

      if (shared.has(actor.id)) {
        // A page with a folded corner over the monitor: someone else writes this file too.
        const fx = place.x + 16
        const fy = place.feet - 13
        c.rect(fx, fy, 3, 3, 23)
        c.set(fx + 2, fy, C.white)
      }

      // The last tool calls, one dot each under the desk: green went well, red did not.
      const trail = (agent?.trail ?? []).slice(-5)
      trail.forEach((outcome: Outcome, index: number) => {
        c.set(place.x + 13 + index * 2, place.feet + 2, outcome === 'ok' ? C.green : C.red)
      })
    }

    this.props.paint(c, this.clock)

    if (this.mood === 'party') {
      // A string of lights across the top of every row, blinking.
      const blink = this.isCalm ? 0 : Math.floor(this.clock * 3)

      for (let band = 0; band * BAND_H < c.height; band++) {
        for (let x = 1; x < c.width; x += 3) {
          c.set(x, band * BAND_H + 1, ACCENTS[(x + blink) % ACCENTS.length]!)
        }
      }
    }
  }

  /** A character's pose as it is drawn: its moves eased toward the real pose, so nothing jumps. */
  private easedOf(id: string, pose: Pose): Shown {
    const target = { dx: pose.dx, dy: pose.dy, squash: pose.squash }
    const last = this.shown.get(id)

    if (!last || this.isPaused) {
      this.shown.set(id, { ...target, at: this.clock })

      return target
    }

    const dt = Math.max(0, Math.min(0.25, this.clock - last.at))
    const k = 1 - Math.exp(-EASE_RATE * dt)
    const next = {
      dx: last.dx + (target.dx - last.dx) * k,
      dy: last.dy + (target.dy - last.dy) * k,
      squash: last.squash + (target.squash - last.squash) * k,
      at: this.clock,
    }
    this.shown.set(id, next)
    this.easing ||= Math.abs(target.dx - next.dx) + Math.abs(target.dy - next.dy) + Math.abs(target.squash - next.squash) > 0.02

    return next
  }

  /**
   * The room's still layers as GPU bitmaps, by what each was drawn for, so
   * a frame copies them instead of drawing them. Each is drawn again only
   * when what it shows changes: the walls with the size, theme or layout;
   * the party lights with the size (one per blink); the furniture, rugs and
   * who-spawned-whom lines when someone sits down or leaves.
   */
  private readonly layers = new Map<string, { image: CanvasImageSource; clocks: { x: number; y: number }[] }>()

  private layer(key: string, ratio: number, paint: (room: CanvasRenderingContext2D) => { x: number; y: number }[] | undefined) {
    const kept = this.layers.get(key)

    if (kept) {
      // Used again: most recent now, so a layer in use this frame is never the one let go.
      this.layers.delete(key)
      this.layers.set(key, kept)

      return kept
    }

    const c = this.pixels
    const s = this.scale
    const width = Math.max(1, Math.ceil(c.width * s * ratio))
    const height = Math.max(1, Math.ceil(c.height * s * ratio))
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : Object.assign(document.createElement('canvas'), { width, height })
    const room = canvas.getContext('2d') as CanvasRenderingContext2D
    room.setTransform(s * ratio, 0, 0, s * ratio, 0, 0)
    const clocks = paint(room) ?? []

    // Old layers are useless once their size or seats are gone: only the last few are kept.
    // Let go, not closed: a bitmap closed while a frame still holds it cannot be drawn,
    // and the frame would throw; the garbage collector frees it once nothing does.
    if (this.layers.size >= 9) this.layers.delete(this.layers.keys().next().value!)

    // Handed to the GPU once as a bitmap, so each frame's copy is a GPU copy.
    const made = { image: 'transferToImageBitmap' in canvas ? canvas.transferToImageBitmap() : canvas, clocks }
    this.layers.set(key, made)

    return made
  }

  private layersFor(ratio: number, mood: Exclude<Theme, 'auto'>) {
    const c = this.pixels
    const s = this.scale
    const size = [c.width, c.height, s, ratio].join('x')
    const walls = this.layer(`walls|${size}|${mood}|${this.layoutKind}`, ratio, room => {
      const clocks = art.drawRoom(room, mood, c.width, c.height, BAND_H, FEET)

      if (this.layoutKind === 'wings' && c.width > WING * SLOT_W) {
        art.drawCorridor(room, WING * SLOT_W, CORRIDOR, c.height)
      }

      return clocks
    })

    const phase = !this.isCalm && !this.isPaused ? Math.floor(this.clock * 3) % 3 : 0
    const garland =
      mood === 'party'
        ? this.layer(`garland|${size}|${phase}`, ratio, room => {
            for (let top = 0; top < c.height; top += BAND_H) art.drawGarland(room, c.width, top, phase / 3 + 0.01, false)
          })
        : null

    const seated = [...this.actors.values()].flatMap(actor => {
      const place = this.placeOf(actor.slot)

      return place ? [{ actor, place, isBoss: actor.id.endsWith(':boss') }] : []
    })
    // Who spawned whom: it changes only when someone sits or leaves.
    const links = seated.flatMap(({ actor, place }) => {
      const parent = this.parentOf(actor)
      const from = parent ? this.placeOf(parent.slot) : null

      return parent && from ? [{ from, to: place, key: `${parent.slot}>${actor.slot}` }] : []
    })
    const seats = seated.map(one => `${one.actor.slot}${one.isBoss ? 'b' : ''}`).sort().join(',')
    const furniture = this.layer(`furniture|${size}|${mood}|${seats}|${links.map(link => link.key).join(',')}`, ratio, room => {
      for (const { place, isBoss } of seated) art.drawRug(room, place.x + 0.5, place.feet + 1, (isBoss ? 2 * SLOT_W : SLOT_W) - 1)

      for (const { place, isBoss } of seated) {
        if (isBoss) art.drawBossFurniture(room, place.x + 1, place.feet)
        else art.drawDeskFurniture(room, place.x + 1, place.feet)

        if (mood === 'night') art.drawDeskLamp(room, place.x + (isBoss ? 37 : 19.5), place.feet)
      }

      // From chair to chair along the bottom of the rows, clear of the names under the desks.
      room.setLineDash([0.1 / s, 0.9])
      room.lineCap = 'round'
      room.lineJoin = 'round'
      room.lineWidth = Math.max(1.5 / s, 0.36)
      room.strokeStyle = 'rgba(201, 166, 107, 0.45)'

      for (const { from, to } of links) {
        const a = { x: from.x + 1.5, y: from.feet + 1 }
        const b = { x: to.x + 1.5, y: to.feet + 1 }
        const mid = Math.max(a.y, b.y) + 7.5
        const r = Math.min(2, Math.abs(b.x - a.x) / 2)
        room.beginPath()
        room.moveTo(a.x, a.y)
        room.arcTo(a.x, mid, b.x, mid, r)
        room.arcTo(b.x, mid, b.x, b.y, r)
        room.lineTo(b.x, b.y)
        room.stroke()
      }
    })

    return { images: [walls.image, ...(garland ? [garland.image] : []), furniture.image], clocks: walls.clocks }
  }
  /** The marks over heads (`!`, `?`, `z`, `♪`) as the illustration last placed them, in office pixels. */
  private marks: { x: number; y: number; text: string; color: number }[] = []

  /**
   * Draws the office as illustration, on the same grid the pixels use, at
   * the office's scale: the cached room, then what moves on top of it.
   */
  private illustrate(ctx: CanvasRenderingContext2D, isWhipHeld: boolean, now: number) {
    const c = this.pixels
    const s = this.scale
    const t = this.isPaused ? 0 : this.clock
    const mood = this.mood
    const shared = this.sharedFiles(now)
    const ratio = Math.abs(ctx.getTransform().a) || 1
    const room = this.layersFor(ratio, mood)
    const ox = this.originX()
    const oy = this.originY()

    ctx.save()
    // Whoever is flung stays inside the room.
    ctx.beginPath()
    ctx.roundRect(this.x, this.y, this.width, this.height, 16)
    ctx.clip()
    for (const image of room.images) ctx.drawImage(image, ox, oy, c.width * s, c.height * s)
    ctx.translate(ox, oy)
    ctx.scale(s, s)

    const date = new Date(now)

    for (const clock of room.clocks) art.drawClockHands(ctx, clock.x, clock.y, date)

    this.marks = []
    this.easing = false
    const glows: art.Glow[] = []

    for (const actor of this.actors.values()) {
      const place = this.placeOf(actor.slot)

      if (!place) continue

      const agent = this.agentOf(actor.id)
      const isBoss = actor.id.endsWith(':boss')

      if (isBoss) art.drawBossScreens(ctx, this.sprites, place.x + 1, place.feet, agent, t, actor.seq, this.isCalm || this.isPaused)
      else art.drawDeskScreen(ctx, this.sprites, place.x + 1, place.feet, agent, t, actor.seq)

      const pose = this.poseFor(actor, isWhipHeld)
      const shown = this.easedOf(actor.id, pose)
      // The character: its shadow, its still drawing as a sprite, and what moves around it.
      const look = agent ? lookOf(agent) : null
      const squash = Math.round(shown.squash * 10) / 10
      const typing = Math.sin(t * 18 + actor.seq) > 0
      const sway = pose.arms === 'wave' ? Math.round(Math.sin(t * 10) * 3) / 5 : 0
      const left = place.x + 2 + shown.dx
      const bottom = place.feet + shown.dy
      art.drawActorShadow(ctx, place.x + 2, place.feet, shown)
      this.sprites.draw(ctx, art.figureKey(pose, squash, actor.seq, typing, sway, isBoss, look), art.FIGURE_BOX, left, bottom, figure =>
        art.drawFigure(figure, 0, 0, pose, squash, actor.seq, typing, sway, isBoss, look),
      )
      art.drawActorEffects(ctx, place.x + 2, place.feet, pose, shown, actor.seq, t, isBoss)
      glows.push({ x: place.x + 1, floor: place.feet, agent, seq: actor.seq })

      if (pose.mark && !pose.isFlat) {
        // Over the head as it is drawn, the same place the pixel art puts it.
        const h = 5 - shown.squash
        const legs = 2 - Math.max(0, shown.squash)
        const top = place.feet + shown.dy - legs - h + 1
        this.marks.push({ x: place.x + 2 + shown.dx + 5, y: top - 2, text: pose.mark, color: pose.markColor })
      }

      if (shared.has(actor.id)) art.drawSharedPage(ctx, place.x + 16, place.feet - 14)

      art.drawTrail(ctx, place.x + 13, place.feet + 2, (agent?.trail ?? []).slice(-5))
    }

    art.drawScreenGlows(ctx, this.sprites, glows, t)

    for (const prop of this.props.items.values()) art.drawProp(ctx, this.sprites, prop)

    if (this.props.robot) art.drawRobot(ctx, this.props.robot.x, this.props.robot.floor, this.clock)

    ctx.restore()

    for (const id of this.shown.keys()) {
      if (!this.actors.has(id)) this.shown.delete(id)
    }
  }

  /** Whether a drawn pose was still catching up with its real one when last drawn: the office wants every frame until it has. */
  get isEasing() {
    return this.easing
  }

  /** The theme right now. */
  get mood() {
    return themeAt(this.theme, new Date())
  }

  /** Draws the office onto the overlay. `scratch` is a canvas the office's pixels are scaled from. */
  draw(ctx: CanvasRenderingContext2D, scratch: HTMLCanvasElement, isWhipHeld: boolean, now: number) {
    if (!this.isShown) return

    // The pixel buffer is only painted for the pixel style (and for film, see ilmFrame).
    if (this.style === 'pixel') this.paint(isWhipHeld, now)
    const c = this.pixels
    const ox = this.originX()
    const oy = this.originY()
    const s = this.scale

    // The room: a dark rounded panel, so it reads over any window. Someone
    // waiting on the person makes its frame pulse yellow.
    const pulse = this.isAnyoneWaiting ? 0.5 + 0.5 * Math.sin(this.clock * 6) : 0
    const isPixel = this.style === 'pixel'
    // The words and marks in the style's own colours.
    const ink = isPixel
      ? { title: '#EFA17F', gold: '#F5C542', text: '#F5F0E6', dim: '#9AA0AA', red: '#E5484D', front: '#C8C4BC' }
      : { title: art.P.title, gold: art.P.mustard, text: art.P.text, dim: art.P.textDim, red: art.P.brick, front: art.P.text }
    ctx.save()

    if (isPixel) {
      ctx.fillStyle =
        this.mood === 'night' ? 'rgba(12, 16, 34, 0.9)' : this.mood === 'party' ? 'rgba(34, 18, 40, 0.88)' : 'rgba(22, 22, 26, 0.86)'
      ctx.beginPath()
      ctx.roundRect(this.x, this.y, this.width, this.height, 12)
      ctx.fill()
    } else {
      art.drawPanel(ctx, this.mood, this.x, this.y, this.width, this.height)
    }

    ctx.beginPath()
    ctx.roundRect(this.x, this.y, this.width, this.height, isPixel ? 12 : 16)

    if (this.isAnyoneWaiting && !isPixel) {
      // The frame breathes gold: a wide faint band under the line, which a
      // blur would cost the GPU many times over.
      ctx.strokeStyle = `rgba(245, 197, 66, ${0.1 + 0.14 * pulse})`
      ctx.lineWidth = 7 + 7 * pulse
      ctx.stroke()
    }

    ctx.strokeStyle = this.isAnyoneWaiting ? `rgba(245, 197, 66, ${0.45 + 0.55 * pulse})` : 'rgba(217, 119, 87, 0.55)'
    ctx.lineWidth = this.isAnyoneWaiting ? 2 + 2 * pulse : 1.5
    ctx.stroke()

    const count = this.tally()
    const stale = this.staleSessions(now).length
    const title = [
      t(this.mood === 'party' ? 'office.titleParty' : this.mood === 'night' ? 'office.titleNight' : 'office.title'),
      t('office.active', { count: count.active }),
      count.waiting ? t('office.waiting', { count: count.waiting }) : '',
      count.done ? t('office.done', { count: count.done }) : '',
      count.failed ? t('office.failed', { count: count.failed }) : '',
      count.isDemo ? 'DEMO' : '',
      stale ? t('office.stale', { count: stale }) : '',
      this.hall ? t('office.hall', { count: this.hall }) : '',
    ]
      .filter(Boolean)
      .join(' · ')
    ctx.font = '600 13px "Segoe UI", system-ui, sans-serif'
    ctx.fillStyle = this.isAnyoneWaiting ? ink.gold : ink.title
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.fillText(title, this.x + PAD + 2, this.y + PAD + TITLE_H / 2 - 2, this.width - 2 * PAD)

    if (isPixel) {
      // The pixels, scaled up crisp.
      if (scratch.width !== c.width || scratch.height !== c.height) {
        scratch.width = c.width
        scratch.height = c.height
      }

      const sctx = scratch.getContext('2d')!
      const image = sctx.createImageData(c.width, c.height)
      c.paint(image)
      sctx.putImageData(image, 0, 0)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(scratch, ox, oy, c.width * s, c.height * s)
    } else {
      this.illustrate(ctx, isWhipHeld, now)
    }

    // Who spawned whom: a dashed line from parent desk to child desk (the
    // illustration has it in its cached room), and a folder travelling down
    // it while the child is new.
    ctx.save()
    ctx.setLineDash([s, s])
    ctx.lineWidth = Math.max(1, s / 3)
    ctx.strokeStyle = 'rgba(239, 161, 127, 0.45)'

    for (const actor of this.actors.values()) {
      const parent = this.parentOf(actor)
      const from = parent ? this.placeOf(parent.slot) : null
      const to = this.placeOf(actor.slot)

      if (!parent || !from || !to || (!isPixel && actor.age >= 1.5)) continue

      // From chair to chair along the bottom of the rows, clear of the names under the desks.
      const a = { x: ox + (from.x + 1.5) * s, y: oy + (from.feet + 1) * s }
      const b = { x: ox + (to.x + 1.5) * s, y: oy + (to.feet + 1) * s }
      const mid = Math.max(a.y, b.y) + 7.5 * s

      if (isPixel) {
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(a.x, mid)
        ctx.lineTo(b.x, mid)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }

      if (actor.age < 1.5) {
        // The errand on its way: a folder sliding along the line.
        const p = actor.age / 1.5
        const legs = [Math.abs(mid - a.y), Math.abs(b.x - a.x), Math.abs(mid - b.y)]
        let along = p * (legs[0]! + legs[1]! + legs[2]!)
        const at =
          along <= legs[0]!
            ? { x: a.x, y: a.y + along }
            : (along -= legs[0]!) <= legs[1]!
              ? { x: a.x + Math.sign(b.x - a.x) * along, y: mid }
              : { x: b.x, y: mid - (along - legs[1]!) }
        ctx.fillStyle = ink.gold
        ctx.fillRect(at.x - s, at.y - s * 0.8, s * 2, s * 1.6)
      }
    }

    ctx.restore()
    // Marks over heads, and a name and a clock under each desk.
    ctx.textAlign = 'center'
    ctx.font = `bold ${Math.round(s * 3.3)}px "Segoe UI", system-ui, sans-serif`

    for (const mark of isPixel ? c.marks : this.marks) {
      const color = isPixel ? PALETTE[mark.color] || ink.text : art.markColor(mark.color)

      if (!isPixel) {
        // Each mark in its own bubble; one asking for permission breathes.
        const size = Math.round(s * 3.3)
        art.drawBubble(ctx, ox + mark.x * s, oy + mark.y * s, size, color, mark.text === '!' && mark.color === C.yellow ? pulse : 0)
      }

      ctx.fillStyle = color
      ctx.fillText(mark.text, ox + mark.x * s, oy + mark.y * s)
    }

    const small = Math.max(10, Math.round(s * 2.1))
    ctx.font = `${small}px "Segoe UI", system-ui, sans-serif`

    for (const actor of this.actors.values()) {
      const place = this.placeOf(actor.slot)
      const agent = this.agentOf(actor.id)

      if (!place || !agent) continue

      const span = agent.isBoss ? 2 * SLOT_W : SLOT_W
      const name = nameOf(agent).slice(0, agent.isBoss ? 30 : 16)
      const cx = ox + (place.x + span / 2) * s
      const cy = oy + (place.feet + 4) * s
      ctx.fillStyle = agent.isBoss ? ink.gold : agent.isDemo ? ink.dim : ink.text
      ctx.fillText(name, cx, cy, span * s - 6)
      const silence = this.silenceOf(agent.sessionId, now)
      const isStale = agent.isBoss && silence > STALE_LINK_MS
      ctx.fillStyle = isStale ? ink.red : ink.dim
      const second = isStale ? t('office.offline', { seconds: Math.round(silence / 1000) }) : agent.isBoss ? stateOf(agent) : elapsedOf(agent, now)
      ctx.fillText(second, cx, cy + small + 3, span * s - 6)
    }

    // The account's limits, and the whip's tally while it is in hand.
    if (this.stats || this.limits.length > 0) {
      const tally = this.stats && this.isWhipOn ? this.stats : null
      const best = tally?.employeeOfTheMonth()
      const footer = [
        this.limits
          .map(one => t(one.kind === 'five_hour' ? 'office.limitFiveHour' : one.kind === 'seven_day' ? 'office.limitWeekly' : 'office.limitSpend', { percent: Math.round(one.percentUsed) }))
          .join(' · '),
        tally ? t('office.hitsToday', { count: tally.today }) : '',
        tally?.criticalsToday ? t('office.criticals', { count: tally.criticalsToday }) : '',
        best ? t('office.employee', { name: best.name, hits: best.hits }) : '',
      ]
        .filter(Boolean)
        .join(' · ')
      ctx.textAlign = 'left'
      ctx.font = '12px "Segoe UI", system-ui, sans-serif'
      ctx.fillStyle = ink.dim
      ctx.fillText(footer, this.x + PAD + 2, this.y + this.height - PAD - FOOTER_H + 12, this.width - 2 * PAD)
    }

    // Where the work is: the folders most touched in the last half hour.
    const fronts = this.folderMap(now).slice(0, 4)

    if (fronts.length > 0) {
      const most = fronts[0]!.count
      let x = this.x + PAD + 2
      const y = this.y + this.height - PAD - 8
      ctx.font = '12px "Segoe UI", system-ui, sans-serif'
      ctx.textAlign = 'left'
      ctx.fillStyle = ink.dim
      const heading = t('office.fronts')
      ctx.fillText(heading, x, y)
      x += ctx.measureText(`${heading} `).width

      for (const [index, front] of fronts.entries()) {
        const bar = Math.max(4, Math.round((36 * front.count) / most))

        if (x + bar + ctx.measureText(front.folder).width + 30 > this.x + this.width - PAD) break

        ctx.fillStyle = isPixel ? PALETTE[ACCENTS[index % ACCENTS.length]!]! : [art.P.body, art.P.sand, art.P.olive, art.P.mustard][index % 4]!
        ctx.fillRect(x, y - 4, bar, 7)
        x += bar + 4
        ctx.fillStyle = ink.front
        ctx.fillText(`${front.folder} ${front.count}`, x, y)
        x += ctx.measureText(`${front.folder} ${front.count}`).width + 12
      }
    }

    ctx.restore()
  }
}
