// The whip's physics: a chain of point masses under Verlet integration with
// length constraints. No drawing and no DOM here, so it runs under node too.

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
  /** Hard cap on the grip's speed, px/s: a teleporting mouse is caught up with. */
  maxGripSpeed: number
  /** The handle's angle at rest, radians (0 points right, negative is up). */
  restAngle: number
  /** How much the thong resists folding at the thick end; less is floppier. */
  stiffness?: number
}

export const WHIP: WhipConfig = {
  points: 40,
  segment: 12.5,
  handle: 104,
  gravity: 2400,
  drag: 1.1,
  iterations: 20,
  stepHz: 240,
  maxSpeed: 16000,
  maxGripSpeed: 14000,
  restAngle: -0.3,
}

const WRIST_SPRING = 500
const WRIST_DAMPING = 28
const WRIST_MAX_SPIN = 40
/** Seconds of grip velocity the handle leans into: a fast hand leads with it. */
const WRIST_LEAD = 1 / 1800
/** Points from the root that are kept out of the hand's circle. */
const KEEP_CLEAR = 16
/** The long anti-curl constraint: how many segments it spans, how far it reaches. */
const CURL_SPAN = 4
const CURL_REACH = 14
const MAX_FRAME = 0.05
const MAX_STEPS = 16

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
  readonly px: Float64Array
  readonly py: Float64Array
  /** Inverse mass per point: 0 at the root, growing toward the light tip. */
  private readonly w: Float64Array
  private readonly damp: Float64Array
  private readonly bend: Float64Array

  gripX = 0
  gripY = 0
  angle: number
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
      this.w[i] = i === 0 ? 0 : 1 / (1 - 0.93 * Math.pow(t, 0.7))
      this.damp[i] = Math.exp(-cfg.drag * (1 + 2 * t) * h)
      this.bend[i] = (cfg.stiffness ?? 0.3) * (1 - t) * (1 - t)
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
    const { cfg, n, x, y, px, py, w } = this

    this.gripX += dx
    this.gripY += dy
    this.gripVX += (dx / h - this.gripVX) * 0.25
    this.gripVY += (dy / h - this.gripVY) * 0.25

    // The wrist: a damped spring toward the rest angle, leaning into the move.
    const aimX = Math.cos(cfg.restAngle) + this.gripVX * WRIST_LEAD
    const aimY = Math.sin(cfg.restAngle) + this.gripVY * WRIST_LEAD
    const off = wrap(Math.atan2(aimY, aimX) - this.angle)
    this.angleVel += (off * WRIST_SPRING - this.angleVel * WRIST_DAMPING) * h
    this.angleVel = Math.max(-WRIST_MAX_SPIN, Math.min(WRIST_MAX_SPIN, this.angleVel))
    this.angle = wrap(this.angle + this.angleVel * h)

    px[0] = x[0]
    py[0] = y[0]
    x[0] = this.gripX + Math.cos(this.angle) * cfg.handle
    y[0] = this.gripY + Math.sin(this.angle) * cfg.handle

    const maxMove = cfg.maxSpeed * h
    const fall = cfg.gravity * h * h

    for (let i = 1; i < n; i++) {
      let vx = (x[i] - px[i]) * this.damp[i]
      let vy = (y[i] - py[i]) * this.damp[i]
      const speed = Math.hypot(vx, vy)

      if (speed > maxMove) {
        vx *= maxMove / speed
        vy *= maxMove / speed
      }

      px[i] = x[i]
      py[i] = y[i]
      x[i] += vx
      y[i] += vy + fall
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
        const ex = x[i + 1] - x[i]
        const ey = y[i + 1] - y[i]
        const d = Math.hypot(ex, ey) || 1e-9
        const k = (d - cfg.segment) / d / (w[i] + w[i + 1])
        x[i] += ex * k * w[i]
        y[i] += ey * k * w[i]
        x[i + 1] -= ex * k * w[i + 1]
        y[i + 1] -= ey * k * w[i + 1]
      }

      // Stiffness against folding, strong at the thick end and gone at the tip.
      for (let i = 0; i < n - 2; i++) {
        const ex = x[i + 2] - x[i]
        const ey = y[i + 2] - y[i]
        const d = Math.hypot(ex, ey) || 1e-9
        const rest = 2 * cfg.segment

        if (d >= rest) {
          continue
        }

        const k = ((d - rest) / d / (w[i] + w[i + 2])) * this.bend[i]
        x[i] += ex * k * w[i]
        y[i] += ey * k * w[i]
        x[i + 2] -= ex * k * w[i + 2]
        y[i + 2] -= ey * k * w[i + 2]
      }

      // The same over a longer span, near the handle only: thick leather
      // bends in an arc, it does not curl into a tight loop.
      for (let i = 0; i < Math.min(n - CURL_SPAN, CURL_REACH); i++) {
        const j = i + CURL_SPAN
        const ex = x[j] - x[i]
        const ey = y[j] - y[i]
        const d = Math.hypot(ex, ey) || 1e-9
        const rest = CURL_SPAN * cfg.segment * 0.8

        if (d >= rest) {
          continue
        }

        const k = ((d - rest) / d / (w[i] + w[j])) * 0.3 * (1 - i / CURL_REACH)
        x[i] += ex * k * w[i]
        y[i] += ey * k * w[i]
        x[j] -= ex * k * w[j]
        y[j] -= ey * k * w[j]
      }
    }
  }

  private pushFromGrip(i: number, rest: number, stiffness: number) {
    const ex = this.x[i] - this.gripX
    const ey = this.y[i] - this.gripY
    const d = Math.hypot(ex, ey) || 1e-9

    if (d >= rest) {
      return
    }

    const k = ((rest - d) / d) * stiffness
    this.x[i] += ex * k
    this.y[i] += ey * k
  }

  /** Speed of point `i` over the last step, px/s. */
  speedAt(i: number): number {
    return Math.hypot(this.x[i] - this.px[i], this.y[i] - this.py[i]) * this.cfg.stepHz
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
      const d = Math.hypot(this.x[i + 1] - this.x[i], this.y[i + 1] - this.y[i])
      worst = Math.max(worst, d / this.cfg.segment)
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
      if (this.speedAt(i) > 4) {
        return false
      }
    }

    return true
  }
}

export type WhipProfile = 'classic' | 'short' | 'long' | 'flexible'

/**
 * Whips that handle differently: the same physics with other lengths,
 * weights and stiffness. `crackScale` moves the crack's threshold with them,
 * since a shorter thong's tip never gets as fast.
 */
export const WHIP_PROFILES: Record<WhipProfile, { label: string; cfg: WhipConfig; crackScale: number }> = {
  classic: { label: 'Clásico', cfg: WHIP, crackScale: 1 },
  short: {
    label: 'Corto y rápido',
    cfg: { ...WHIP, points: 28, segment: 10, handle: 90, drag: 1.3 },
    crackScale: 0.72,
  },
  long: {
    label: 'Largo y pesado',
    cfg: { ...WHIP, points: 52, segment: 13.5, handle: 112, gravity: 2700, drag: 1.0 },
    crackScale: 1.18,
  },
  flexible: {
    label: 'Flexible',
    cfg: { ...WHIP, stiffness: 0.1, drag: 0.9 },
    crackScale: 0.92,
  },
}
