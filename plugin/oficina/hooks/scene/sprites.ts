// Everything the office shows, drawn pixel by pixel from code: the little
// Claudes, their desks, the whip, and the sparks. No images.

import type { OficinaAgent } from '../../types/snapshot'
import type { Pose } from './actors.ts'
import { ACCENTS, C } from './canvas.ts'
import type { Canvas } from './canvas.ts'
import type { Whip } from './whip.ts'

/** A character's box: ten pixels wide, seven tall on its feet. */
export const ACTOR_W = 10
export const ACTOR_H = 7

export type BodyBox = { x0: number; y0: number; x1: number; y1: number }

/** Where the body is for a pose seated at `x`, feet on `feet`: what the whip can hit. */
export const bodyBox = (x: number, feet: number, pose: Pose): BodyBox => {
  const left = x + pose.dx
  const bottom = feet + pose.dy

  return pose.isFlat
    ? { x0: left, y0: bottom - 3, x1: left + ACTOR_W, y1: bottom }
    : { x0: left + 1, y0: bottom - ACTOR_H + 1, x1: left + ACTOR_W - 1, y1: bottom }
}

const drawAccessory = (c: Canvas, kind: number, accent: number, bx: number, top: number, w: number, h: number) => {
  const mid = bx + Math.floor(w / 2)

  if (kind === 0) {
    // A cap.
    c.rect(bx + 2, top - 2, w - 4, 1, accent)
    c.rect(bx + 1, top - 1, w - 1, 1, accent)
  } else if (kind === 1) {
    // Headphones.
    c.rect(bx + 1, top - 1, w - 2, 1, accent)
    c.set(bx, top, accent)
    c.set(bx + w - 1, top, accent)
  } else if (kind === 2) {
    // A scarf.
    c.rect(bx, top + h - 1, w, 1, accent)
    c.set(bx + w - 2, top + h, accent)
  } else if (kind === 3) {
    // An antenna with a light.
    c.set(mid, top - 1, C.grey)
    c.set(mid, top - 2, accent)
  } else if (kind === 4) {
    // A bow.
    c.set(mid - 1, top - 1, accent)
    c.set(mid + 1, top - 1, accent)
    c.set(mid, top, accent)
  } else {
    // A tie.
    c.set(mid, top + h - 2, accent)
    c.set(mid, top + h - 1, accent)
  }
}

/** One character, seated at `x` with its feet on pixel row `feet`. */
export const drawActor = (c: Canvas, x: number, feet: number, pose: Pose, seq: number, t: number, topRow = 0) => {
  const left = x + pose.dx
  const bottom = feet + pose.dy
  const accent = ACCENTS[seq % ACCENTS.length]!
  const accessory = Math.floor(seq / ACCENTS.length + seq) % 6

  if (pose.isFlat) {
    // On its back: a low wide body, eyes crossed out, legs in the air.
    c.rect(left, bottom - 2, ACTOR_W, 3, C.body)
    c.rect(left, bottom, ACTOR_W, 1, C.shade)
    c.rect(left + 2, bottom - 1, 2, 1, C.eye)
    c.rect(left + 6, bottom - 1, 2, 1, C.eye)
    c.set(left + 3, bottom - 3, C.body)
    c.set(left + 6, bottom - 3, C.body)
  } else {
    const w = 8 + 2 * pose.squash
    const h = 5 - pose.squash
    const legs = pose.squash === 1 ? 1 : 2
    const bx = left + 1 - pose.squash
    const top = bottom - legs - h + 1

    // Legs, two pairs; a walk lifts one of each pair.
    for (const [index, lx] of [bx + 1, bx + 3, bx + w - 4, bx + w - 2].entries()) {
      const isLifted = legs === 2 && (index % 2 === 0 ? pose.legs === 1 : false)
      c.rect(lx, bottom - legs + 1, 1, isLifted ? legs - 1 : legs, C.shade)
    }

    c.rect(bx, top, w, h, C.body)
    c.rect(bx, top + h - 1, w, 1, C.shade)
    c.set(bx, top, C.lit)
    c.set(bx + 1, top, C.lit)

    // Arms.
    const ay = top + 2
    const lx = bx - 1
    const rx = bx + w

    if (pose.arms === 'down') {
      c.set(lx, ay, C.body)
      c.set(rx, ay, C.body)
    } else if (pose.arms === 'typeA' || pose.arms === 'typeB') {
      c.set(lx, ay, C.body)
      c.set(rx, ay, C.body)
      c.set(rx + 1, pose.arms === 'typeA' ? ay : ay + 1, C.body)
    } else if (pose.arms === 'up') {
      c.rect(lx, top - 1, 1, 2, C.body)
      c.rect(rx, top - 1, 1, 2, C.body)
    } else if (pose.arms === 'cover') {
      c.rect(bx, top - 1, 3, 1, C.body)
      c.rect(bx + w - 3, top - 1, 3, 1, C.body)
      c.set(lx, top, C.body)
      c.set(rx, top, C.body)
    } else if (pose.arms === 'raise' || pose.arms === 'wave') {
      c.set(lx, ay, C.body)
      c.rect(rx, top - 2, 1, 3, C.body)
      c.set(pose.arms === 'wave' ? rx + 1 : rx, top - 3, C.body)
    } else {
      c.set(lx, ay, C.body)
      c.rect(rx, ay, 2, 1, C.body)
    }

    // Eyes.
    const ey = top + 1
    const el = bx + 2
    const er = bx + w - 3

    if (pose.eyes === 'open') {
      c.rect(el, ey, 1, 2, C.eye)
      c.rect(er, ey, 1, 2, C.eye)
    } else if (pose.eyes === 'closed') {
      c.rect(el - 1, ey + 1, 2, 1, C.eye)
      c.rect(er, ey + 1, 2, 1, C.eye)
    } else if (pose.eyes === 'happy') {
      c.set(el, ey, C.eye)
      c.set(er, ey, C.eye)
    } else if (pose.eyes === 'pain') {
      c.rect(el - 1, ey, 2, 1, C.eye)
      c.rect(er, ey, 2, 1, C.eye)
      c.set(el, ey + 1, C.eye)
      c.set(er, ey + 1, C.eye)
    } else {
      // Wide, or looking to a side: whites with a pupil.
      const look = pose.eyes === 'right' ? 1 : pose.eyes === 'left' ? 0 : -1
      c.rect(el - 1, ey, 2, 2, C.white)
      c.rect(er, ey, 2, 2, C.white)
      c.set(el - 1 + (look === -1 ? 0 : look), ey + (look === -1 ? 0 : 1), C.eye)
      c.set(er + (look === -1 ? 1 : look), ey + (look === -1 ? 0 : 1), C.eye)
    }

    drawAccessory(c, accessory, accent, bx, top, w, h)

    if (pose.prop === 'paper') {
      c.rect(rx + 1, ay - 2, 3, 4, C.white)
      c.set(rx + 2, ay - 1, C.grey)
      c.set(rx + 2, ay + 1, C.grey)
    } else if (pose.prop === 'lens') {
      c.rect(rx + 2, ay - 3, 3, 3, C.grey)
      c.set(rx + 3, ay - 2, C.tear)
      c.set(rx + 1, ay, C.grey)
    }

    if (pose.hasSweat) {
      c.set(bx + w, top - 1 + (Math.floor(t * 4) % 2), C.tear)
    }

    if (pose.mark) {
      // Kept inside its own row of desks: never over the names of the row above.
      c.text(bx + Math.floor(w / 2), Math.max(topRow, Math.floor((top - 4) / 2)), pose.mark, pose.markColor)
    }
  }

  const headX = left + 5
  const headY = bottom - (pose.isFlat ? 5 : 9)

  if (pose.stars > 0) {
    for (let k = 0; k < 3; k++) {
      const a = pose.stars * 7 + (k * Math.PI * 2) / 3
      c.set(headX + Math.cos(a) * 4, headY + Math.sin(a) * 1.5, C.yellow)
    }
  }

  if (pose.tears > 0) {
    const fall = Math.floor(pose.tears * 9) % 4
    c.set(left + 1, bottom - 4 + fall, C.tear)
    c.set(left + 8, bottom - 4 + ((fall + 2) % 4), C.tear)
  }

  if (pose.confetti > 0) {
    for (let k = 0; k < 5; k++) {
      const a = k * 1.3 + seq
      const r = 3 + pose.confetti * 3
      const cy = headY - 1 + Math.sin(a) * r * 0.5 + pose.confetti * 3

      // Never over the names of the row of desks above.
      if (cy >= topRow * 2) {
        c.set(headX + Math.cos(a) * r, cy, ACCENTS[k % ACCENTS.length]!)
      }
    }
  }
}

/** A desk, a chair and a monitor whose screen shows what the agent is observably doing. */
export const drawDesk = (c: Canvas, x: number, floor: number, agent: OficinaAgent | undefined, t: number, seq: number) => {
  // The chair, behind where the character sits.
  c.rect(x, floor - 5, 1, 6, C.grey)
  c.rect(x, floor - 1, 4, 1, C.grey)

  const dx = x + 12
  c.rect(dx - 1, floor - 4, 9, 1, C.desk)
  c.rect(dx, floor - 3, 1, 4, C.deskShade)
  c.rect(dx + 6, floor - 3, 1, 4, C.deskShade)

  // The monitor: a frame, a stand, and three pixels by two of screen.
  c.rect(dx + 1, floor - 9, 5, 4, C.frame)
  c.set(dx + 3, floor - 5, C.frame)
  const sx = dx + 2
  const sy = floor - 8
  const beat = Math.floor(t * 4 + seq)
  const status = agent?.status ?? 'unknown'
  const activity = agent?.activity ?? 'working'
  c.rect(sx, sy, 3, 2, C.screen)

  if (status === 'unknown') {
    return
  }

  if (status === 'done') {
    c.rect(sx, sy, 3, 2, C.green)
  } else if (status === 'failed') {
    c.rect(sx, sy, 3, 2, C.red)
  } else if (status === 'idle') {
    c.set(sx + 1, sy, C.grey)
  } else if (activity === 'waiting') {
    c.rect(sx, sy, 3, 2, beat % 2 === 0 ? C.yellow : C.screen)
  } else if (activity === 'tool') {
    // A progress bar that fills and starts over.
    c.rect(sx, sy + 1, (beat % 4), 1, C.green)
  } else if (activity === 'reading' || activity === 'searching') {
    c.rect(sx, sy, 3, 1, C.white)
    c.set(sx + (beat % 3), sy + 1, C.blue)
  } else {
    // Lines of code scrolling by.
    c.set(sx + (beat % 3), sy, C.blue)
    c.set(sx + ((beat + 1) % 3), sy, C.green)
    c.rect(sx, sy + 1, 1 + ((beat >> 1) % 3), 1, activity === 'editing' ? C.yellow : C.blue)
  }
}

/** The whip put away: a small coil on a hook in the top right corner. */
export const drawCoil = (c: Canvas) => {
  const x = c.width - 5
  c.rect(x, 0, 4, 1, C.whipMid)
  c.rect(x, 3, 4, 1, C.whipDark)
  c.rect(x - 1, 1, 1, 2, C.whipMid)
  c.rect(x + 4, 1, 1, 2, C.whipDark)
  c.set(x + 4, 4, C.cream)
}

/** The whip: a wrapped handle, a thong that thins toward a pale cracker. */
export const drawWhip = (c: Canvas, whip: Whip, isLive: boolean) => {
  const { n, x, y } = whip

  for (let i = n - 2; i >= 0; i--) {
    const share = i / (n - 1)
    const color = share > 0.88 ? C.cream : share > 0.55 ? C.whipTan : share > 0.25 ? C.whipMid : C.whipDark
    c.line(x[i]!, y[i]!, x[i + 1]!, y[i + 1]!, color)

    // The thick end is two pixels across.
    if (share < 0.3) {
      c.line(x[i]!, y[i]! + 1, x[i + 1]!, y[i + 1]! + 1, C.whipDark)
    }
  }

  c.line(whip.gripX, whip.gripY, x[0]!, y[0]!, isLive ? C.whipTan : C.whipMid)
  c.line(whip.gripX, whip.gripY + 1, x[0]!, y[0]! + 1, C.whipDark)
  c.set(x[0]!, y[0]!, C.grey)
  c.set(whip.gripX, whip.gripY, isLive ? C.yellow : C.cream)
}

// --- Sparks ------------------------------------------------------------------------

export type Spark = { x: number; y: number; vx: number; vy: number; age: number; life: number; color: number }

export type Flash = { x: number; y: number; age: number; life: number; size: number }

export class Fx {
  sparks: Spark[] = []
  flashes: Flash[] = []
  /** The tip's recent path, for the streak behind a fast swing. */
  trail: { x: number; y: number; speed: number }[] = []

  get isActive() {
    return this.sparks.length > 0 || this.flashes.length > 0 || this.trail.some(point => point.speed > 300)
  }

  pushTip(x: number, y: number, speed: number) {
    this.trail.push({ x, y, speed })

    if (this.trail.length > 14) {
      this.trail.shift()
    }
  }

  /** A burst at a point: a crack in the air is pale, a hit on a body is warm. */
  burst(x: number, y: number, intensity: number, isHit: boolean) {
    this.flashes.push({ x, y, age: 0, life: 0.16, size: isHit ? 2 : 1 })
    const count = 3 + Math.round(intensity * 4)

    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2
      const speed = 14 + Math.random() * 30

      this.sparks.push({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 8,
        age: 0,
        life: 0.2 + Math.random() * 0.25,
        color: isHit ? (k % 2 === 0 ? C.yellow : C.red) : C.cream,
      })
    }
  }

  update(dt: number) {
    for (const flash of this.flashes) flash.age += dt

    for (const spark of this.sparks) {
      spark.age += dt
      spark.vy += 90 * dt
      spark.x += spark.vx * dt
      spark.y += spark.vy * dt
    }

    this.flashes = this.flashes.filter(flash => flash.age < flash.life)
    this.sparks = this.sparks.filter(spark => spark.age < spark.life)
  }

  drawTrail(c: Canvas) {
    for (let i = 1; i < this.trail.length; i++) {
      const point = this.trail[i]!

      const before = this.trail[i - 1]!

      // The last few steps of a fast tip; a jump too long to be a path is skipped.
      if (point.speed > 450 && i > this.trail.length - 7 && Math.hypot(point.x - before.x, point.y - before.y) < 9) {
        c.line(before.x, before.y, point.x, point.y, C.grey)
      }
    }
  }

  drawBursts(c: Canvas) {
    for (const flash of this.flashes) {
      const reach = flash.size + Math.round((flash.age / flash.life) * 2)
      c.set(flash.x, flash.y, C.white)

      for (let k = 1; k <= reach; k++) {
        const color = k === reach ? C.yellow : C.white
        c.set(flash.x + k, flash.y, color)
        c.set(flash.x - k, flash.y, color)
        c.set(flash.x, flash.y + k, color)
        c.set(flash.x, flash.y - k, color)
      }
    }

    for (const spark of this.sparks) {
      c.set(spark.x, spark.y, spark.color)
    }
  }
}
