// The whip's physics: a chain of point masses under Verlet integration with
// length constraints, in the scene's pixel units. No drawing here.

export type WhipConfig = {
  /** Point masses along the thong, the root (handle's end) included. */
  points: number
  /** Rest distance between two neighbours, px. */
  segment: number
  /** Distance from the grip (where the hand is) to the root, px. */
  handle: number
  /** px/s². */
  gravity: number
  /** Air drag at the root, 1/s; the light tip gets three times as much. */
  drag: number
  /** Constraint passes per step. */
  iterations: number
  /** Fixed steps per second. */
  stepHz: number
  /** Hard cap on a point's speed, px/s: what keeps a violent jerk finite. */
  maxSpeed: number
  /** Hard cap on the grip's speed, px/s: a teleporting pointer is caught up with. */
  maxGripSpeed: number
  /** The handle's angle at rest, radians (0 points right, negative is up). */
  restAngle: number
  /** Seconds of grip velocity the handle leans into. */
  wristLead: number
  /** Point speed under which the whip counts as still, px/s. */
  restSpeed: number
}

/** Sized for a scene a few dozen pixels across. */
export const WHIP: WhipConfig = {
  points: 24,
  segment: 1.15,
  handle: 5,
  gravity: 230,
  drag: 1.1,
  iterations: 16,
  stepHz: 240,
  maxSpeed: 1500,
  maxGripSpeed: 1300,
  restAngle: -0.3,
  wristLead: 1 / 170,
  restSpeed: 0.5,
}

const WRIST_SPRING = 500
const WRIST_DAMPING = 28
const WRIST_MAX_SPIN = 40
/** Points from the root that are kept out of the hand's circle. */
const KEEP_CLEAR = 10
/** The long anti-curl constraint: how many segments it spans, how far it reaches. */
const CURL_SPAN = 4
const CURL_REACH = 9
const MAX_FRAME = 0.06
const MAX_STEPS = 18

const wrap = (a: number) => {
  while (a > Math.PI) a -= 2 * Math.PI
  while (a < -Math.PI) a += 2 * Math.PI

  return a
}

export class Whip {
  readonly cfg: WhipConfig
  readonly n: number
  readonly x: Float64Array
  readonly y: Float64Array
  /** Where each point was one step ago: what a sweep tests against. */
  readonly px: Float64Array
  readonly py: Float64Array
  private readonly w: Float64Array
  private readonly damp: Float64Array
  private readonly bend: Float64Array

  gripX = 0
  gripY = 0
  angle: number
  /** The scene's edges: the thong lies on the floor and stops at the walls. */
  bounds = { x0: -Infinity, y0: -Infinity, x1: Infinity, y1: Infinity }
  private targetX = 0
  private targetY = 0
  private gripVX = 0
  private gripVY = 0
  private angleVel = 0
  private acc = 0

  constructor(x: number, y: number, cfg: WhipConfig = WHIP) {
    this.cfg = cfg
    this.n = cfg.points
    this.x = new Float64Array(this.n)
    this.y = new Float64Array(this.n)
    this.px = new Float64Array(this.n)
    this.py = new Float64Array(this.n)
    this.w = new Float64Array(this.n)
    this.damp = new Float64Array(this.n)
    this.bend = new Float64Array(this.n)
    this.angle = cfg.restAngle

    const h = 1 / cfg.stepHz

    for (let i = 0; i < this.n; i++) {
      const t = i / (this.n - 1)
      // The taper is what makes a whip a whip: momentum handed down to ever
      // lighter leather has to show up as speed.
      this.w[i] = i === 0 ? 0 : 1 / (1 - 0.93 * t ** 0.7)
      this.damp[i] = Math.exp(-cfg.drag * (1 + 2 * t) * h)
      this.bend[i] = 0.3 * (1 - t) * (1 - t)
    }

    this.reset(x, y)
  }

  /** Puts the grip at a point with the thong hanging still beneath the root. */
  reset(x: number, y: number) {
    this.gripX = this.targetX = x
    this.gripY = this.targetY = y
    this.gripVX = this.gripVY = 0
    this.angle = this.cfg.restAngle
    this.angleVel = 0
    this.acc = 0

    const rootX = x + Math.cos(this.angle) * this.cfg.handle
    const rootY = y + Math.sin(this.angle) * this.cfg.handle

    for (let i = 0; i < this.n; i++) {
      this.x[i] = this.px[i] = rootX
      this.y[i] = this.py[i] = rootY + i * this.cfg.segment
    }
  }

  /** Where the hand wants the grip; the simulation walks it there. */
  setTarget(x: number, y: number) {
    this.targetX = x
    this.targetY = y
  }

  /**
   * Advances by wall-clock seconds in fixed steps, calling `onStep` after
   * each. A long gap (a pause, a lost focus) is cut to MAX_FRAME, not replayed.
   */
  advance(elapsed: number, onStep?: (h: number) => void): number {
    const h = 1 / this.cfg.stepHz
    this.acc += Math.min(Math.max(elapsed, 0), MAX_FRAME)
    const steps = Math.min(Math.floor(this.acc / h), MAX_STEPS)
    this.acc -= steps * h
    const reach = this.cfg.maxGripSpeed * h

    for (let s = 0; s < steps; s++) {
      // Spread the hand's move over the frame's steps so the root glides.
      const share = 1 / (steps - s)
      let dx = (this.targetX - this.gripX) * share
      let dy = (this.targetY - this.gripY) * share
      const d = Math.hypot(dx, dy)

      if (d > reach) {
        dx *= reach / d
        dy *= reach / d
      }

      this.step(h, dx, dy)
      onStep?.(h)
    }

    return steps
  }

  private step(h: number, dx: number, dy: number) {
    const { cfg, n, x, y, px, py } = this

    this.gripX += dx
    this.gripY += dy
    this.gripVX += (dx / h - this.gripVX) * 0.25
    this.gripVY += (dy / h - this.gripVY) * 0.25

    // The wrist: a damped spring toward the rest angle, leaning into the move.
    const aimX = Math.cos(cfg.restAngle) + this.gripVX * cfg.wristLead
    const aimY = Math.sin(cfg.restAngle) + this.gripVY * cfg.wristLead
    const off = wrap(Math.atan2(aimY, aimX) - this.angle)
    this.angleVel += (off * WRIST_SPRING - this.angleVel * WRIST_DAMPING) * h
    this.angleVel = Math.max(-WRIST_MAX_SPIN, Math.min(WRIST_MAX_SPIN, this.angleVel))
    this.angle = wrap(this.angle + this.angleVel * h)

    px[0] = x[0]!
    py[0] = y[0]!
    x[0] = this.gripX + Math.cos(this.angle) * cfg.handle
    y[0] = this.gripY + Math.sin(this.angle) * cfg.handle

    const maxMove = cfg.maxSpeed * h
    const fall = cfg.gravity * h * h

    for (let i = 1; i < n; i++) {
      let vx = (x[i]! - px[i]!) * this.damp[i]!
      let vy = (y[i]! - py[i]!) * this.damp[i]!
      const speed = Math.hypot(vx, vy)

      if (speed > maxMove) {
        vx *= maxMove / speed
        vy *= maxMove / speed
      }

      px[i] = x[i]!
      py[i] = y[i]!
      x[i]! += vx
      y[i]! += vy + fall
    }

    for (let pass = 0; pass < cfg.iterations; pass++) {
      // The thong leaves the handle in the handle's direction.
      this.pushFromGrip(1, cfg.handle + cfg.segment, 0.6)
      this.pushFromGrip(2, cfg.handle + 2 * cfg.segment, 0.25)

      // The thick end never swings back across the handle: the hand is there.
      for (let i = 3; i < Math.min(n, KEEP_CLEAR); i++) {
        this.pushFromGrip(i, cfg.handle, 0.5)
      }

      for (let i = 0; i < n - 1; i++) {
        this.pull(i, i + 1, cfg.segment, 1, true)
      }

      // Stiffness against folding, strong at the thick end and gone at the tip.
      for (let i = 0; i < n - 2; i++) {
        this.pull(i, i + 2, 2 * cfg.segment, this.bend[i]!, false)
      }

      // The same over a longer span, near the handle only: thick leather
      // bends in an arc, it does not curl into a tight loop.
      for (let i = 0; i < Math.min(n - CURL_SPAN, CURL_REACH); i++) {
        this.pull(i, i + CURL_SPAN, CURL_SPAN * cfg.segment * 0.8, 0.3 * (1 - i / CURL_REACH), false)
      }

      for (let i = 1; i < n; i++) {
        x[i] = Math.max(this.bounds.x0, Math.min(this.bounds.x1, x[i]!))
        y[i] = Math.max(this.bounds.y0, Math.min(this.bounds.y1, y[i]!))
      }
    }
  }

  /** Moves two points toward `rest` apart; `isRope` also pulls them together. */
  private pull(i: number, j: number, rest: number, stiffness: number, isRope: boolean) {
    const { x, y, w } = this
    const ex = x[j]! - x[i]!
    const ey = y[j]! - y[i]!
    const d = Math.hypot(ex, ey) || 1e-9

    if (!isRope && d >= rest) {
      return
    }

    const k = ((d - rest) / d / (w[i]! + w[j]!)) * stiffness
    x[i]! += ex * k * w[i]!
    y[i]! += ey * k * w[i]!
    x[j]! -= ex * k * w[j]!
    y[j]! -= ey * k * w[j]!
  }

  private pushFromGrip(i: number, rest: number, stiffness: number) {
    const ex = this.x[i]! - this.gripX
    const ey = this.y[i]! - this.gripY
    const d = Math.hypot(ex, ey) || 1e-9

    if (d >= rest) {
      return
    }

    const k = ((rest - d) / d) * stiffness
    this.x[i]! += ex * k
    this.y[i]! += ey * k
  }

  /** Speed of point `i` over the last step, px/s. */
  speedAt(i: number): number {
    return Math.hypot(this.x[i]! - this.px[i]!, this.y[i]! - this.py[i]!) * this.cfg.stepHz
  }

  /** The tip's speed, px/s, averaged over the last three points. */
  tipSpeed(): number {
    const n = this.n

    return (this.speedAt(n - 1) + this.speedAt(n - 2) + this.speedAt(n - 3)) / 3
  }

  /** The longest segment as a multiple of its rest length: 1 is unstretched. */
  stretch(): number {
    let worst = 0

    for (let i = 0; i < this.n - 1; i++) {
      worst = Math.max(worst, Math.hypot(this.x[i + 1]! - this.x[i]!, this.y[i + 1]! - this.y[i]!) / this.cfg.segment)
    }

    return worst
  }

  /** True once nothing visibly moves and the hand is where it was asked to be. */
  isResting(): boolean {
    if (Math.hypot(this.targetX - this.gripX, this.targetY - this.gripY) > 0.01) {
      return false
    }

    if (Math.abs(this.angleVel) > 0.02) {
      return false
    }

    for (let i = 0; i < this.n; i++) {
      if (this.speedAt(i) > this.cfg.restSpeed) {
        return false
      }
    }

    return true
  }
}

// --- Crack detection ---------------------------------------------------------

export type CrackConfig = {
  /** Tip speed a peak must reach to count, px/s. */
  fire: number
  /** Tip speed the whip must fall back under before it can crack again. */
  rearm: number
  /** Seconds that must pass between two cracks, whatever the speed does. */
  minInterval: number
}

export const CRACK: CrackConfig = { fire: 640, rearm: 240, minInterval: 0.22 }

export type Crack = { intensity: number; speed: number }

/** Decides when a swing is a crack: the tip peaks past a threshold and falls. */
export class CrackDetector {
  private readonly cfg: CrackConfig
  private isArmed = true
  private peak = 0
  private sinceLast = Infinity

  constructor(cfg: CrackConfig = CRACK) {
    this.cfg = cfg
  }

  /** Feed the tip speed once per simulation step. */
  update(speed: number, h: number): Crack | null {
    this.sinceLast += h

    if (!this.isArmed) {
      if (speed < this.cfg.rearm && this.sinceLast >= this.cfg.minInterval) {
        this.isArmed = true
        this.peak = 0
      }

      return null
    }

    if (speed >= this.peak) {
      this.peak = speed

      return null
    }

    if (this.peak >= this.cfg.fire && speed < this.peak * 0.88) {
      const crack = { intensity: Math.min(1, (this.peak - this.cfg.fire) / this.cfg.fire), speed: this.peak }
      this.isArmed = false
      this.sinceLast = 0
      this.peak = 0

      return crack
    }

    if (speed < this.cfg.rearm) {
      this.peak = 0
    }

    return null
  }
}

// --- Collisions ----------------------------------------------------------------

export type Box = { id: string; x0: number; y0: number; x1: number; y1: number }

export type Strike = { id: string; speed: number; dir: 1 | -1; x: number; y: number }

/** The share of the thong, from the tip back, that can strike. */
const STRIKING_SHARE = 0.4

/** Whether the segment a→b crosses the box (slab test). */
const crosses = (ax: number, ay: number, bx: number, by: number, box: Box) => {
  let t0 = 0
  let t1 = 1
  const dx = bx - ax
  const dy = by - ay

  for (const [p, d, lo, hi] of [
    [ax, dx, box.x0, box.x1],
    [ay, dy, box.y0, box.y1],
  ] as const) {
    if (Math.abs(d) < 1e-9) {
      if (p < lo || p > hi) return false
      continue
    }

    const a = (lo - p) / d
    const b = (hi - p) / d
    t0 = Math.max(t0, Math.min(a, b))
    t1 = Math.min(t1, Math.max(a, b))

    if (t0 > t1) return false
  }

  return true
}

/**
 * What the whip's striking end hit during the last step: each point's path
 * from where it was to where it is, so a tip crossing a body between two
 * steps still counts. One strike per box, the fastest.
 */
export const strikes = (whip: Whip, boxes: readonly Box[]): Strike[] => {
  const found: Strike[] = []
  const from = Math.floor(whip.n * (1 - STRIKING_SHARE))

  for (const box of boxes) {
    let best: Strike | null = null

    for (let i = from; i < whip.n; i++) {
      if (!crosses(whip.px[i]!, whip.py[i]!, whip.x[i]!, whip.y[i]!, box)) continue

      const speed = whip.speedAt(i)

      if (best === null || speed > best.speed) {
        best = { id: box.id, speed, dir: whip.x[i]! >= whip.px[i]! ? 1 : -1, x: whip.x[i]!, y: whip.y[i]! }
      }
    }

    if (best) found.push(best)
  }

  return found
}
