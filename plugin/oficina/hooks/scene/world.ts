// The whole scene as one object the surface module steps and draws: desks,
// characters, the whip, collisions and sparks. It knows nothing of the
// engine, so a test can drive it directly.

import type { OficinaAgent } from '../../types/snapshot'
import { say } from '../i18n.ts'
import type { Lang, StringKey } from '../i18n.ts'
import { advance, isWary, poseOf, seat, strike } from './actors.ts'
import type { Actor, Pose, ReactionKind } from './actors.ts'
import { C, Canvas } from './canvas.ts'
import type { Run } from './canvas.ts'
import { ACTOR_W, bodyBox, drawActor, drawCoil, drawDesk, drawWhip, Fx } from './sprites.ts'
import { CrackDetector, strikes, Whip } from './whip.ts'
import type { Box } from './whip.ts'

export type SceneProps = {
  agents: OficinaAgent[]
  isWhipOn: boolean
  isPaused: boolean
  /** The language of the words the scene draws; English when absent. */
  lang?: Lang
}

/** What the scene tells the hooks module, which owns the sound. */
export type SceneEvent = { k: 'crack'; i: number } | { k: 'hit'; id: string; s: ReactionKind }

export type PointerInput = {
  type: 'down' | 'move' | 'up' | 'enter' | 'leave'
  x: number
  y: number
  fine?: { x: number; y: number }
  button?: 'left' | 'middle' | 'right'
}

/** Cells: a desk's width, the rows a row of desks takes, the rows kept clear above, the info row. */
export const SLOT_W = 20
export const BAND_ROWS = 8
export const HEAD_ROWS = 2
export const INFO_ROWS = 1
/** How close to the handle, in pixels, a press still grabs it. */
const GRAB_REACH = 5
/** A failed agent found this long after it ended is not given a desk. */
const STALE_MS = 15000

const pad = (n: number) => String(n).padStart(2, '0')

export const elapsedOf = (agent: OficinaAgent, now: number) => {
  if (agent.startedAt === 0) return '--:--'

  const seconds = Math.max(0, Math.floor(((agent.endedAt || now) - agent.startedAt) / 1000))

  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`
}

const ACTIVITY: Record<OficinaAgent['activity'], StringKey> = {
  working: 'working',
  reading: 'reading',
  searching: 'searching',
  editing: 'editing',
  tool: 'tool',
  waiting: 'waiting',
}

export const stateOf = (agent: OficinaAgent, lang: Lang = 'en') =>
  agent.status === 'running'
    ? say(lang, ACTIVITY[agent.activity])
    : agent.status === 'idle'
      ? say(lang, 'idle')
      : agent.status === 'done'
        ? say(lang, 'finished')
        : agent.status === 'failed'
          ? `${say(lang, 'failedAs')}${agent.note ? ` (${agent.note})` : ''}`
          : say(lang, 'stateUnknown')

export class World {
  readonly canvas = new Canvas()
  readonly whip = new Whip(0, 0)
  readonly fx = new Fx()
  private readonly detector = new CrackDetector()
  readonly actors = new Map<string, Actor>()
  /** Agents whose character already walked out: never seated again. */
  private readonly gone = new Set<string>()
  props: SceneProps = { agents: [], isWhipOn: false, isPaused: false }
  /** Seconds of scene time. */
  clock = 0
  isGrabbed = false
  private grabDX = 0
  private grabDY = 0
  /** Where the press that took the whip came down, in cells, and whether it has dragged since. */
  private pressX = 0
  private pressY = 0
  private hasDragged = false
  selected: string | null = null
  page = 0
  private perRow = 1
  private bands = 1
  private left = 0
  private hasPlacedWhip = false

  get capacity() {
    return this.perRow * this.bands
  }

  get pages() {
    let top = -1

    for (const actor of this.actors.values()) top = Math.max(top, actor.slot)

    return Math.max(1, Math.ceil((top + 1) / this.capacity))
  }

  /** Lays the scene out for a region of cells; the whip keeps its place when it still fits. */
  resize(columns: number, rows: number) {
    if (columns < 1 || rows < 1 || (columns === this.canvas.columns && rows === this.canvas.rows)) {
      return
    }

    this.canvas.resize(columns, rows)
    this.perRow = Math.max(1, Math.floor(columns / SLOT_W))
    this.bands = Math.max(1, Math.min(2, Math.floor((rows - HEAD_ROWS - INFO_ROWS) / BAND_ROWS)))
    this.left = Math.max(0, Math.floor((columns - this.perRow * SLOT_W) / 2))
    this.whip.bounds = { x0: 0, y0: 0, x1: this.canvas.width - 1, y1: this.floorOf(this.bands - 1) }
    const isInside =
      this.whip.gripX >= 1 &&
      this.whip.gripX <= this.canvas.width - 2 &&
      this.whip.gripY >= 1 &&
      this.whip.gripY <= this.canvas.height - 2

    if (!this.hasPlacedWhip || !isInside) {
      this.hasPlacedWhip = true
      this.whip.reset(Math.max(2, this.canvas.width - 9), 3)
    }

    this.page = Math.min(this.page, this.pages - 1)
  }

  /** The pixel row a band's characters stand on. */
  private floorOf(band: number) {
    return (HEAD_ROWS + band * BAND_ROWS) * 2 + 13
  }

  /** Where a slot is drawn, or null when it is on another page. */
  private placeOf(slot: number): { x: number; floor: number; labelRow: number } | null {
    const local = slot - this.page * this.capacity

    if (local < 0 || local >= this.capacity) {
      return null
    }

    const band = Math.floor(local / this.perRow)

    return {
      x: this.left + (local % this.perRow) * SLOT_W,
      floor: this.floorOf(band),
      labelRow: HEAD_ROWS + band * BAND_ROWS + BAND_ROWS - 1,
    }
  }

  private agentOf(id: string) {
    return this.props.agents.find(agent => agent.id === id)
  }

  /** Gives every agent worth showing a character at a desk of its own. */
  private seatAgents() {
    const taken = new Set<number>()

    for (const actor of this.actors.values()) taken.add(actor.slot)

    for (const agent of [...this.props.agents].sort((a, b) => a.seq - b.seq)) {
      if (this.actors.has(agent.id)) continue

      const isLive = agent.status === 'running' || agent.status === 'idle' || agent.status === 'unknown'

      // One that walked out stays out, unless it is seen working again.
      if (this.gone.has(agent.id)) {
        if (agent.status !== 'running' && agent.status !== 'idle') continue

        this.gone.delete(agent.id)
      }

      const isFreshFailure = agent.status === 'failed' && Date.now() - agent.endedAt < STALE_MS

      if (!isLive && !isFreshFailure) {
        // It finished before it could be seen at a desk: only the tally shows it.
        this.gone.add(agent.id)
        continue
      }

      let slot = 0

      while (taken.has(slot)) slot += 1

      taken.add(slot)
      this.actors.set(agent.id, seat(agent, slot))
    }
  }

  private poseFor(actor: Actor): Pose {
    const pose = poseOf(actor, this.agentOf(actor.id), this.clock, !this.props.isPaused)

    // A character that was hit lately keeps an eye on a whip in someone's hand.
    if (this.isGrabbed && actor.reaction === null && pose.eyes === 'open' && isWary(actor, this.clock)) {
      pose.eyes = 'wide'
    }

    return pose
  }

  private boxes(): Box[] {
    const boxes: Box[] = []

    for (const actor of this.actors.values()) {
      const place = this.placeOf(actor.slot)

      if (place) {
        boxes.push({ id: actor.id, ...bodyBox(place.x + 2, place.floor, this.poseFor(actor)) })
      }
    }

    return boxes
  }

  /** Moves the scene on by `dt` seconds. */
  step(dt: number): { events: SceneEvent[]; isBusy: boolean } {
    const events: SceneEvent[] = []
    this.clock += dt
    this.seatAgents()

    if (!this.props.isWhipOn && this.isGrabbed) {
      this.release()
    }

    // Put away, the whip is a coil on its hook: nothing to simulate.
    const isWhipMoving = this.props.isWhipOn && (this.isGrabbed || !this.whip.isResting())

    if (isWhipMoving) {
      const boxes = this.boxes()
      const tip = this.whip.n - 1

      this.whip.advance(dt, h => {
        const speed = this.whip.tipSpeed()
        this.fx.pushTip(this.whip.x[tip]!, this.whip.y[tip]!, speed)
        const crack = this.detector.update(speed, h)

        if (crack) {
          // One event: the sound and the flash both come from it.
          events.push({ k: 'crack', i: crack.intensity })
          this.fx.burst(this.whip.x[tip]!, this.whip.y[tip]!, crack.intensity, false)
        }

        for (const hit of strikes(this.whip, boxes)) {
          const actor = this.actors.get(hit.id)
          const kind = actor ? strike(actor, hit.speed, hit.dir, this.clock) : null

          if (kind) {
            events.push({ k: 'hit', id: hit.id, s: kind })
            this.fx.burst(hit.x, hit.y, Math.min(1, hit.speed / 900), true)
          }
        }
      })
    }

    let isBusy = isWhipMoving

    for (const actor of [...this.actors.values()]) {
      const agent = this.agentOf(actor.id)
      isBusy = advance(actor, agent, dt) || isBusy

      if (actor.isGone) {
        this.actors.delete(actor.id)

        if (agent) this.gone.add(actor.id)
        if (this.selected === actor.id) this.selected = null
      }
    }

    this.fx.update(dt)
    this.page = Math.min(this.page, this.pages - 1)

    return { events, isBusy: isBusy || this.fx.isActive }
  }

  private release() {
    this.isGrabbed = false
    // Anchored where the hand is, not where the pointer ran ahead to.
    this.whip.setTarget(this.whip.gripX, this.whip.gripY)
  }

  /** The character whose desk is under a point, in pixels. */
  private actorAt(x: number, y: number): string | null {
    let picked: string | null = null

    for (const actor of this.actors.values()) {
      const place = this.placeOf(actor.slot)

      if (place && x >= place.x && x < place.x + SLOT_W && y >= place.floor - 13 && y <= place.floor + 2) {
        picked = actor.id
      }
    }

    return picked
  }

  private select(x: number, y: number) {
    const picked = this.actorAt(x, y)
    this.selected = picked === this.selected ? null : picked
  }

  /**
   * One pointer event over the region. Returns whether anything changed.
   *
   * With the whip in hand, a press anywhere takes it: on the handle it is
   * held where it was gripped; anywhere else the hand picks it up right
   * there, hanging still, so the press itself strikes nobody. A press that
   * never drags is still a click, and shows that character's details.
   */
  pointer(e: PointerInput): boolean {
    const x = e.fine?.x ?? e.x + 0.5
    const y = (e.fine?.y ?? e.y + 0.5) * 2

    if (e.type === 'down' && e.button !== 'right' && e.button !== 'middle') {
      if (e.y >= this.canvas.rows - INFO_ROWS && this.pages > 1) {
        // The pager sits at the right end of the info row.
        const from = this.canvas.columns - 9
        if (e.x >= from) this.page = (this.page + (e.x >= from + 5 ? 1 : this.pages - 1)) % this.pages

        return true
      }

      if (!this.props.isWhipOn) {
        this.select(x, y)

        return true
      }

      const { whip } = this
      const reach = Math.min(
        Math.hypot(x - whip.gripX, y - whip.gripY),
        Math.hypot(x - whip.x[0]!, y - whip.y[0]!),
        Math.hypot(x - (whip.gripX + whip.x[0]!) / 2, y - (whip.gripY + whip.y[0]!) / 2),
      )

      if (reach > GRAB_REACH) {
        whip.reset(this.clampX(x), this.clampY(y))
      }

      this.isGrabbed = true
      this.grabDX = x - whip.gripX
      this.grabDY = y - whip.gripY
      this.pressX = e.x
      this.pressY = e.y
      this.hasDragged = false

      return true
    }

    if (e.type === 'move' && this.isGrabbed) {
      // A move with no button held means the release was missed (focus lost).
      if (e.button === undefined) {
        this.release()

        return true
      }

      if (Math.abs(e.x - this.pressX) + Math.abs(e.y - this.pressY) > 0) {
        this.hasDragged = true
      }

      this.whip.setTarget(this.clampX(x - this.grabDX), this.clampY(y - this.grabDY))

      return true
    }

    if (e.type === 'up' && this.isGrabbed) {
      this.release()

      if (!this.hasDragged) {
        this.select(this.pressX + 0.5, (this.pressY + 0.5) * 2)
      }

      return true
    }

    return false
  }

  private clampX(x: number) {
    return Math.max(1, Math.min(this.canvas.width - 2, x))
  }

  private clampY(y: number) {
    return Math.max(1, Math.min(this.canvas.height - 2, y))
  }

  /** Paints the scene and hands back its rows of styled runs. */
  draw(): Run[][] {
    const c = this.canvas
    const now = Date.now()
    const lang = this.props.lang ?? 'en'
    c.clear()

    const bySlot = new Map<number, Actor>()

    for (const actor of this.actors.values()) bySlot.set(actor.slot, actor)

    for (let local = 0; local < this.capacity; local++) {
      const slot = this.page * this.capacity + local
      const place = this.placeOf(slot)!
      const actor = bySlot.get(slot)
      const agent = actor ? this.agentOf(actor.id) : undefined
      const seq = actor?.seq ?? slot
      drawDesk(c, place.x + 1, place.floor, actor ? (agent ?? undefined) : undefined, this.props.isPaused ? 0 : this.clock, seq)

      if (!actor) continue

      drawActor(c, place.x + 2, place.floor, this.poseFor(actor), actor.seq, this.clock, place.labelRow - BAND_ROWS + 1)

      if (agent) {
        const mark = this.selected === actor.id ? '▸' : agent.isDemo ? '◦' : ' '
        const name = (agent.name || agent.type || say(lang, 'agent')).slice(0, SLOT_W - 9)
        c.text(place.x, place.labelRow, `${mark}${name} ${elapsedOf(agent, now)}`.slice(0, SLOT_W - 1))
      }
    }

    if (this.props.isWhipOn) {
      this.fx.drawTrail(c)
      drawWhip(c, this.whip, this.isGrabbed)
    } else {
      drawCoil(c)
    }

    this.fx.drawBursts(c)

    const row = c.rows - INFO_ROWS
    const picked = this.selected ? this.agentOf(this.selected) : undefined
    const info = picked
      ? [picked.name || say(lang, 'agent'), picked.type || say(lang, 'typeUnknown'), stateOf(picked, lang), picked.detail, elapsedOf(picked, now)]
          .filter(Boolean)
          .join(' · ') + (picked.isDemo ? ' · DEMO' : '')
      : this.props.isWhipOn
        ? this.isGrabbed
          ? ''
          : say(lang, 'whipHint')
        : this.actors.size === 0
          ? say(lang, 'emptyOffice')
          : say(lang, 'pickHint')

    const pager = this.pages > 1 ? ` ‹ ${this.page + 1}/${this.pages} ›` : ''
    c.text(0, row, info.slice(0, Math.max(0, c.columns - pager.length)), picked ? 0 : C.grey)

    if (pager) {
      c.text(c.columns - 9, row, pager.padStart(9))
    }

    return c.runs()
  }

  /** The centre of a seated character, in pointer cells: what a test aims at. */
  centreOf(id: string): { x: number; y: number } | null {
    const actor = this.actors.get(id)
    const place = actor ? this.placeOf(actor.slot) : null

    return place ? { x: place.x + 2 + ACTOR_W / 2, y: (place.floor - 3) / 2 } : null
  }
}
