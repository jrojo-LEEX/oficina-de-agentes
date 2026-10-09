// What sits on the desks and can be knocked over: a cup, two pencils and a
// stack of folders per desk, in office pixels. The whip sends them flying,
// its thong can hook one and fling it, and once the dust settles a little
// cleaning robot puts everything back. Purely for show: nothing here
// touches an agent. Bodies sleep when still, so a calm office costs nothing.

import { C } from './pixels.ts'
import type { Pixels } from './pixels.ts'

export type PropKind = 'cup' | 'pencil' | 'folder' | 'paper'

type PropState = 'rest' | 'flying' | 'down' | 'held' | 'carried'

export type Prop = {
  id: string
  /** The desk it belongs to: its slot. */
  slot: number
  kind: PropKind
  x: number
  y: number
  vx: number
  vy: number
  w: number
  h: number
  /** Where it sits when tidy. */
  homeX: number
  homeY: number
  /** The floor under it: the row's feet line. */
  floor: number
  state: PropState
  /** A loose sheet from a folder: it is swept away, not put back. */
  isLoose: boolean
}

/** A desk as the props see it: its slot, where it starts and where its row's floor is. */
export type Desk = { slot: number; x: number; feet: number; isBoss: boolean }

export type PropBox = { id: string; x0: number; y0: number; x1: number; y1: number }

const GRAVITY = 140
const BOUNCE = 0.35
const FRICTION = 0.86
/** Speeds under this, in office pixels a second, are taken for still. */
const REST_SPEED = 3
/** Sheets a folder spills when hit. */
const SHEETS = 3
/** At most this many bodies move at once; the oldest settle first. */
const MAX_ACTIVE = 14
/** Seconds the office must be quiet before the robot comes to tidy up. */
const TIDY_AFTER = 4
const ROBOT_SPEED = 28

type Robot = { x: number; floor: number; target: Prop | null; isLeaving: boolean; t: number }

export class Props {
  readonly items = new Map<string, Prop>()
  private quiet = 0
  robot: Robot | null = null
  /** The office's width in pixels: walls for flying props. */
  width = 0
  private sheetCount = 0

  /** Gives each seated desk its things, and takes them away from emptied desks. */
  sync(desks: Desk[], width: number) {
    this.width = width
    const slots = new Set(desks.map(desk => desk.slot))

    for (const [id, prop] of this.items) {
      if (!slots.has(prop.slot)) this.items.delete(id)
    }

    for (const desk of desks) {
      if ([...this.items.values()].some(prop => prop.slot === desk.slot)) continue

      // On the desk top, clear of the monitors' stands: the desk's top row is four above the feet.
      const top = desk.feet - 4
      this.add(desk, 'cup', desk.x + (desk.isBoss ? 30 : 19), top - 2, 2, 2)
      this.add(desk, 'pencil', desk.x + (desk.isBoss ? 19 : 13), top - 1, 2, 1)
      this.add(desk, 'folder', desk.x + (desk.isBoss ? 27 : 17), top - 1, 2, 1)
    }
  }

  private add(desk: Desk, kind: PropKind, x: number, y: number, w: number, h: number, isLoose = false) {
    const id = `${desk.slot}:${kind}${isLoose ? `:${(this.sheetCount += 1)}` : ''}`
    this.items.set(id, {
      id,
      slot: desk.slot,
      kind,
      x,
      y,
      vx: 0,
      vy: 0,
      w,
      h,
      homeX: x,
      homeY: y,
      floor: desk.feet,
      state: 'rest',
      isLoose,
    })

    return this.items.get(id)!
  }

  /** Anything moving, or a robot at work: the office wants frames. */
  get isBusy() {
    return this.robot !== null || [...this.items.values()].some(prop => prop.state === 'flying' || prop.state === 'held' || prop.state === 'carried')
  }

  /** Whether anything is out of place. */
  get isMessy() {
    return [...this.items.values()].some(prop => prop.state === 'down' || prop.state === 'flying')
  }

  /** Every prop, in screen pixels for an office drawn at `scale` from (`ox`, `oy`): what the whip can hit. */
  boxes(ox: number, oy: number, scale: number, margin = 1): PropBox[] {
    return [...this.items.values()]
      .filter(prop => prop.state !== 'carried' && prop.state !== 'held')
      .map(prop => ({
        id: `prop:${prop.id}`,
        x0: ox + (prop.x - margin) * scale,
        y0: oy + (prop.y - margin) * scale,
        x1: ox + (prop.x + prop.w + margin) * scale,
        y1: oy + (prop.y + prop.h + margin) * scale,
      }))
  }

  /** The whip struck a prop: `speed` in office pixels a second, `dir` the way the whip went. */
  hit(id: string, speed: number, dir: 1 | -1): boolean {
    const prop = this.items.get(id.replace(/^prop:/, ''))

    if (!prop || prop.state === 'carried' || prop.state === 'held' || speed < 40) return false

    const push = Math.min(90, speed * 0.12)
    this.launch(prop, dir * push, -Math.min(70, 25 + push * 0.6))

    if (prop.kind === 'folder' && prop.state !== 'down') {
      // The stack bursts: a few loose sheets go everywhere.
      const desk = { slot: prop.slot, x: prop.homeX, feet: prop.floor, isBoss: false }

      for (let k = 0; k < SHEETS; k++) {
        const sheet = this.add(desk, 'paper', prop.x, prop.y, 2, 1, true)
        this.launch(sheet, dir * push * (0.4 + 0.3 * k), -30 - 15 * k)
      }
    }

    this.quiet = 0

    return true
  }

  private launch(prop: Prop, vx: number, vy: number) {
    prop.state = 'flying'
    prop.vx = vx
    prop.vy = vy

    // Too many bodies at once: the oldest flyers drop where they are.
    const flying = [...this.items.values()].filter(one => one.state === 'flying')

    for (const one of flying.slice(0, Math.max(0, flying.length - MAX_ACTIVE))) {
      one.state = 'down'
      one.y = one.floor - one.h
      one.vx = one.vy = 0
    }
  }

  /**
   * The thong's tip, in office pixels, and its speed: a slow tip over a
   * fallen prop hooks it; a hooked prop rides the tip, and a flick lets it go flying.
   */
  hook(tipX: number, tipY: number, vx: number, vy: number, isHeld: boolean) {
    const speed = Math.hypot(vx, vy)
    const held = [...this.items.values()].find(prop => prop.state === 'held')

    if (held) {
      if (!isHeld || speed > 220) {
        // Let go: it keeps the tip's speed, a little less.
        this.launch(held, vx * 0.5, vy * 0.5)
        this.quiet = 0
      } else {
        held.x = tipX - held.w / 2
        held.y = tipY - held.h / 2
      }

      return
    }

    if (!isHeld || speed > 60) return

    const near = [...this.items.values()].find(
      prop => prop.state === 'down' && Math.abs(prop.x + prop.w / 2 - tipX) < 2 && Math.abs(prop.y + prop.h / 2 - tipY) < 2,
    )

    if (near) near.state = 'held'
  }

  /** Moves everything on by `dt` seconds. */
  step(dt: number) {
    let isMoving = false

    for (const prop of this.items.values()) {
      if (prop.state !== 'flying') continue

      isMoving = true
      prop.vy += GRAVITY * dt
      prop.x += prop.vx * dt
      prop.y += prop.vy * dt

      if (prop.x < 0 || prop.x + prop.w > this.width) {
        prop.x = Math.max(0, Math.min(this.width - prop.w, prop.x))
        prop.vx = -prop.vx * BOUNCE
      }

      if (prop.y + prop.h >= prop.floor) {
        prop.y = prop.floor - prop.h
        prop.vy = -prop.vy * BOUNCE
        // A pencil rolls on; everything else slides to a stop.
        prop.vx *= prop.kind === 'pencil' ? 0.97 : FRICTION

        if (Math.abs(prop.vy) < REST_SPEED * 3 && Math.abs(prop.vx) < REST_SPEED) {
          prop.state = 'down'
          prop.vx = prop.vy = 0
        }
      }
    }

    if (isMoving || this.robot) {
      this.quiet = 0
    } else {
      this.quiet += dt
    }

    this.tidy(dt)
  }

  /** The robot: comes once things are quiet, takes each fallen thing home, and goes. */
  private tidy(dt: number) {
    const fallen = [...this.items.values()].filter(prop => prop.state === 'down')

    if (!this.robot) {
      if (fallen.length === 0 || this.quiet < TIDY_AFTER) return

      this.robot = { x: -6, floor: fallen[0]!.floor, target: null, isLeaving: false, t: 0 }
    }

    const robot = this.robot
    robot.t += dt

    if (robot.isLeaving) {
      robot.x += ROBOT_SPEED * dt

      if (robot.x > this.width + 6) this.robot = null

      return
    }

    if (!robot.target) {
      // The next fallen thing on its floor, else the next floor, else home time.
      const next = fallen.find(prop => prop.floor === robot.floor) ?? fallen[0]

      if (!next) {
        robot.isLeaving = true

        return
      }

      if (next.floor !== robot.floor) {
        robot.floor = next.floor
        robot.x = -6
      }

      robot.target = next
    }

    const target = robot.target
    const carried = target.state === 'carried'
    const goal = carried ? target.homeX : target.x
    const step = Math.sign(goal - robot.x) * Math.min(Math.abs(goal - robot.x), ROBOT_SPEED * dt)
    robot.x += step

    if (carried) {
      target.x = robot.x
      target.y = robot.floor - 7 - target.h
    }

    if (Math.abs(goal - robot.x) < 0.5) {
      if (!carried) {
        target.state = 'carried'
      } else {
        // Back where it belongs; a loose sheet goes in the bin instead.
        if (target.isLoose) {
          this.items.delete(target.id)
        } else {
          target.x = target.homeX
          target.y = target.homeY
          target.state = 'rest'
        }

        robot.target = null
      }
    }
  }

  /** Draws the props and the robot into the office's pixels. */
  paint(c: Pixels, t: number) {
    for (const prop of this.items.values()) {
      const x = Math.round(prop.x)
      const y = Math.round(prop.y)

      if (prop.kind === 'cup') {
        // A mug and its handle; coffee showing while it stands.
        c.rect(x, y, 1, 2, C.white)
        c.set(x + 1, y, C.white)
        if (prop.state === 'rest') c.set(x, y, C.deskShade)
      } else if (prop.kind === 'pencil') {
        c.set(x, y, C.yellow)
        c.set(x + 1, y, C.eye)
      } else if (prop.kind === 'folder') {
        c.rect(x, y, 2, 1, C.blue)
      } else {
        c.rect(x, y, 2, 1, C.white)
      }
    }

    if (this.robot) {
      // The cleaning robot: a grey box on wheels with a blinking light; not one of the agents.
      const x = Math.round(this.robot.x)
      const floor = this.robot.floor
      c.rect(x, floor - 5, 5, 4, C.grey)
      c.rect(x + 1, floor - 4, 3, 1, C.screen)
      c.set(x + 2, floor - 6, Math.floor(t * 4) % 2 === 0 ? C.red : C.grey)
      c.set(x, floor - 1, C.eye)
      c.set(x + 4, floor - 1, C.eye)
    }
  }
}
