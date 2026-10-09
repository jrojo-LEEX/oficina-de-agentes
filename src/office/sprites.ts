// The little Claudes and their desks, drawn pixel by pixel from code, the
// same drawings as the Oficina mod's. No images.

import type { Pose } from './actors.ts'
import { ACCENTS, C } from './pixels.ts'
import type { Pixels } from './pixels.ts'
import type { OficinaAgent } from './types.ts'

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

const drawAccessory = (c: Pixels, kind: number, accent: number, bx: number, top: number, w: number, h: number) => {
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
/** A crown, for the boss: the session's own Claude. */
const drawCrown = (c: Pixels, bx: number, top: number, w: number) => {
  const mid = bx + Math.floor(w / 2)
  c.rect(bx + 1, top - 1, w - 2, 1, C.yellow)
  c.set(bx + 1, top - 2, C.yellow)
  c.set(mid, top - 2, C.yellow)
  c.set(bx + w - 2, top - 2, C.yellow)
  c.set(mid, top - 1, C.red)
}

/** What a character wears for what it is: none gets the accessory its number picks. */
export type Look = 'explorer' | 'plans' | 'glasses' | null

const drawLook = (c: Pixels, look: Exclude<Look, null>, bx: number, top: number, w: number, rx: number, ay: number) => {
  if (look === 'explorer') {
    // A safari hat, brim wider than the head.
    c.rect(bx + 1, top - 2, w - 2, 1, C.desk)
    c.rect(bx - 1, top - 1, w + 2, 1, C.deskShade)
  } else if (look === 'plans') {
    // A rolled-up blueprint under the arm.
    c.rect(rx, ay + 1, 4, 1, C.blue)
    c.set(rx + 3, ay + 1, C.white)
  } else {
    // Reading glasses: one thin frame line across the eyes, the eyes left showing.
    const left = bx + 2
    const right = bx + w - 3

    for (let x = left - 1; x <= right + 1; x++) {
      if (x !== left && x !== right) c.set(x, top + 1, C.grey)
    }
  }
}

export const drawActor = (c: Pixels, x: number, feet: number, pose: Pose, seq: number, t: number, isBoss = false, look: Look = null) => {
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

    if (isBoss) drawCrown(c, bx, top, w)
    else if (look) drawLook(c, look, bx, top, w, rx, ay)
    else drawAccessory(c, accessory, accent, bx, top, w, h)

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
      c.mark(bx + w / 2, top - 2, pose.mark, pose.markColor)
    }
  }

  const headX = left + 5
  const headY = bottom - (pose.isFlat ? 5 : 9)

  if (pose.stars > 0) {
    const count = pose.hasBigStars ? 6 : 3
    const reach = pose.hasBigStars ? 6 : 4

    for (let k = 0; k < count; k++) {
      const a = pose.stars * 7 + (k * Math.PI * 2) / count
      c.set(headX + Math.cos(a) * reach, headY + Math.sin(a) * (reach * 0.4), C.yellow)
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

      c.set(headX + Math.cos(a) * r, cy, ACCENTS[k % ACCENTS.length]!)
    }
  }
}

/** Three pixels by two of screen, showing what the agent is observably doing. */
const drawScreen = (c: Pixels, sx: number, sy: number, agent: OficinaAgent | undefined, beat: number) => {
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
    c.rect(sx, sy + 1, beat % 4, 1, C.green)
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

/** A desk, a chair and a monitor whose screen shows what the agent is observably doing. */
export const drawDesk = (c: Pixels, x: number, floor: number, agent: OficinaAgent | undefined, t: number, seq: number) => {
  // The chair, behind where the character sits.
  c.rect(x, floor - 5, 1, 6, C.grey)
  c.rect(x, floor - 1, 4, 1, C.grey)

  const dx = x + 12
  c.rect(dx - 1, floor - 4, 9, 1, C.desk)
  c.rect(dx, floor - 3, 1, 4, C.deskShade)
  c.rect(dx + 6, floor - 3, 1, 4, C.deskShade)

  // The monitor: a frame, a stand, and the screen.
  c.rect(dx + 1, floor - 9, 5, 4, C.frame)
  c.set(dx + 3, floor - 5, C.frame)
  drawScreen(c, dx + 2, floor - 8, agent, Math.floor(t * 4 + seq))
}

/**
 * The boss's desk, two desks wide: a high-backed chair, a long desk, the
 * working monitor, a second one with a chart, and a plant.
 */
export const drawBossDesk = (c: Pixels, x: number, floor: number, agent: OficinaAgent | undefined, t: number, seq: number) => {
  c.rect(x, floor - 8, 1, 9, C.grey)
  c.rect(x - 1, floor - 8, 1, 3, C.grey)
  c.rect(x, floor - 1, 4, 1, C.grey)

  const dx = x + 12
  c.rect(dx - 1, floor - 4, 26, 1, C.desk)
  c.rect(dx - 1, floor - 3, 26, 1, C.deskShade)
  c.rect(dx, floor - 2, 1, 3, C.deskShade)
  c.rect(dx + 23, floor - 2, 1, 3, C.deskShade)

  const beat = Math.floor(t * 4 + seq)
  c.rect(dx + 1, floor - 9, 5, 4, C.frame)
  c.set(dx + 3, floor - 5, C.frame)
  drawScreen(c, dx + 2, floor - 8, agent, beat)

  // The second monitor: a little bar chart that never stops growing.
  c.rect(dx + 8, floor - 9, 5, 4, C.frame)
  c.set(dx + 10, floor - 5, C.frame)
  c.rect(dx + 9, floor - 8, 3, 2, C.screen)
  c.set(dx + 9, floor - 7, C.green)
  c.rect(dx + 10, floor - 8 + (beat % 2), 1, 2 - (beat % 2), C.green)
  c.rect(dx + 11, floor - 8, 1, 2, C.yellow)

  // A plant in a pot.
  c.rect(dx + 19, floor - 6, 3, 2, C.deskShade)
  c.set(dx + 19, floor - 8, C.green)
  c.set(dx + 21, floor - 8, C.green)
  c.rect(dx + 20, floor - 9, 1, 3, C.green)
}
