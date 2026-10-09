// Draws the whip from the simulation's points: a smooth tapered ribbon shaded
// like a round braided thong, and a wrapped handle. Geometry only, no images.

import type { Whip } from './sim.ts'

/** Curve samples drawn between two neighbouring simulation points. */
const SUBDIVISIONS = 4
/** Toward the light, in screen space: up and to the left. */
const LIGHT = { x: -0.6, y: -0.8 }
const POMMEL = 13
const GRIP_HALF = 11
const ROOT_HALF = 8
/** How far from the handle's axis a press still grabs it, px. */
const GRAB_REACH = 22

let xs = new Float64Array(0)
let ys = new Float64Array(0)
let nx = new Float64Array(0)
let ny = new Float64Array(0)
let hw = new Float64Array(0)

/** Half the thong's width at `t` along it: thick at the handle, a thread at the tip. */
const halfWidth = (t: number) =>
  t < 0.85
    ? 7 + (1.8 - 7) * Math.pow(t / 0.85, 0.8)
    : 1.8 + (0.7 - 1.8) * ((t - 0.85) / 0.15)

/** Catmull-Rom through the simulation's points, into the shared buffers. */
const sample = (whip: Whip): number => {
  const { n, x, y } = whip
  const count = (n - 1) * SUBDIVISIONS + 1

  if (xs.length !== count) {
    xs = new Float64Array(count)
    ys = new Float64Array(count)
    nx = new Float64Array(count)
    ny = new Float64Array(count)
    hw = new Float64Array(count)
  }

  // A phantom point behind the root keeps the thong leaving along the handle.
  const beforeX = x[0] - Math.cos(whip.angle) * whip.cfg.segment
  const beforeY = y[0] - Math.sin(whip.angle) * whip.cfg.segment

  for (let i = 0; i < n - 1; i++) {
    const ax = i === 0 ? beforeX : x[i - 1]
    const ay = i === 0 ? beforeY : y[i - 1]
    const dx = i + 2 < n ? x[i + 2] : 2 * x[i + 1] - x[i]
    const dy = i + 2 < n ? y[i + 2] : 2 * y[i + 1] - y[i]

    for (let s = 0; s < SUBDIVISIONS; s++) {
      const u = s / SUBDIVISIONS
      const u2 = u * u
      const u3 = u2 * u
      const k = i * SUBDIVISIONS + s
      xs[k] =
        0.5 * (2 * x[i] + (x[i + 1] - ax) * u + (2 * ax - 5 * x[i] + 4 * x[i + 1] - dx) * u2 + (3 * x[i] - ax - 3 * x[i + 1] + dx) * u3)
      ys[k] =
        0.5 * (2 * y[i] + (y[i + 1] - ay) * u + (2 * ay - 5 * y[i] + 4 * y[i + 1] - dy) * u2 + (3 * y[i] - ay - 3 * y[i + 1] + dy) * u3)
    }
  }

  xs[count - 1] = x[n - 1]
  ys[count - 1] = y[n - 1]

  for (let k = 0; k < count; k++) {
    const a = Math.max(0, k - 1)
    const b = Math.min(count - 1, k + 1)
    const tx = xs[b] - xs[a]
    const ty = ys[b] - ys[a]
    const length = Math.hypot(tx, ty) || 1
    nx[k] = -ty / length
    ny[k] = tx / length
    hw[k] = halfWidth(k / (count - 1))
  }

  return count
}

/**
 * Traces the thong as a closed outline: `scale` of its width, its centre
 * pushed `shift` of the half-width toward the light, as a lit cylinder reads.
 */
const ribbon = (ctx: CanvasRenderingContext2D, count: number, scale: number, shift: number) => {
  ctx.beginPath()

  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < count; j++) {
      const k = pass === 0 ? j : count - 1 - j
      const side = pass === 0 ? 1 : -1
      const lit = (nx[k] * LIGHT.x + ny[k] * LIGHT.y) * shift
      const off = hw[k] * (lit + side * scale)
      const px = xs[k] + nx[k] * off
      const py = ys[k] + ny[k] * off

      if (pass === 0 && j === 0) {
        ctx.moveTo(px, py)
      } else {
        ctx.lineTo(px, py)
      }
    }
  }

  ctx.closePath()
}

const drawThong = (ctx: CanvasRenderingContext2D, whip: Whip) => {
  const count = sample(whip)

  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'
  ctx.shadowBlur = 7
  ctx.shadowOffsetY = 3
  ctx.fillStyle = '#2f1b0e'
  ribbon(ctx, count, 1, 0)
  ctx.fill()
  ctx.restore()

  ctx.fillStyle = '#7a4a28'
  ribbon(ctx, count, 0.72, 0.2)
  ctx.fill()

  ctx.fillStyle = 'rgba(226, 172, 112, 0.78)'
  ribbon(ctx, count, 0.24, 0.5)
  ctx.fill()

  // The plait: slanted strands across the body, alternating like a braid.
  ctx.strokeStyle = 'rgba(24, 12, 4, 0.42)'
  ctx.lineWidth = 1
  ctx.beginPath()

  for (let k = 0; k + 2 < count && hw[k] > 1.9; k += 2) {
    const flip = (k / 2) % 2 === 0 ? 1 : -1
    ctx.moveTo(xs[k] + nx[k] * hw[k] * flip, ys[k] + ny[k] * hw[k] * flip)
    ctx.lineTo(xs[k + 2] - nx[k + 2] * hw[k + 2] * flip, ys[k + 2] - ny[k + 2] * hw[k + 2] * flip)
  }

  ctx.stroke()

  // The fall and the cracker: pale cord past a small knot, frayed at the end.
  const knot = Math.round((count - 1) * 0.85)
  ctx.strokeStyle = '#e8dcc0'
  ctx.lineWidth = 1.7
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(xs[knot], ys[knot])

  for (let k = knot + 1; k < count; k++) {
    ctx.lineTo(xs[k], ys[k])
  }

  const last = count - 1
  const tipAngle = Math.atan2(-nx[last], ny[last])

  for (const spread of [-0.45, 0, 0.45]) {
    ctx.moveTo(xs[last], ys[last])
    ctx.lineTo(xs[last] + Math.cos(tipAngle + spread) * 7, ys[last] + Math.sin(tipAngle + spread) * 7)
  }

  ctx.stroke()

  ctx.fillStyle = '#24140a'
  ctx.beginPath()
  ctx.arc(xs[knot], ys[knot], 3, 0, Math.PI * 2)
  ctx.fill()
}

const handleOutline = (ctx: CanvasRenderingContext2D, length: number) => {
  ctx.beginPath()
  ctx.moveTo(0, -GRIP_HALF)
  ctx.lineTo(length, -ROOT_HALF)
  ctx.lineTo(length, ROOT_HALF)
  ctx.lineTo(0, GRIP_HALF)
  ctx.closePath()
}

const drawHandle = (ctx: CanvasRenderingContext2D, whip: Whip, glow: number) => {
  const length = whip.cfg.handle

  ctx.save()
  ctx.translate(whip.gripX, whip.gripY)
  ctx.rotate(whip.angle)

  if (glow > 0) {
    ctx.save()
    ctx.shadowColor = `rgba(255, 214, 140, ${glow})`
    ctx.shadowBlur = 18
    ctx.strokeStyle = `rgba(255, 214, 140, ${glow})`
    ctx.lineWidth = 5
    ctx.lineJoin = 'round'
    handleOutline(ctx, length)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(-4, 0, POMMEL + 1, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }

  // The wrist loop, behind everything else.
  ctx.strokeStyle = '#5a3518'
  ctx.lineWidth = 3.2
  ctx.beginPath()
  ctx.ellipse(-23, 9, 17, 9, 0.55, 0, Math.PI * 2)
  ctx.stroke()

  // The grip: a tapered rod shaded across its width.
  const wood = ctx.createLinearGradient(0, -GRIP_HALF, 0, GRIP_HALF)
  wood.addColorStop(0, '#1f1008')
  wood.addColorStop(0.3, '#8b5a32')
  wood.addColorStop(0.45, '#d2a06a')
  wood.addColorStop(0.62, '#7a4a26')
  wood.addColorStop(1, '#1a0d05')
  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
  ctx.shadowBlur = 8
  ctx.shadowOffsetY = 3
  ctx.fillStyle = wood
  handleOutline(ctx, length)
  ctx.fill()
  ctx.restore()

  // The leather wrap: slanted turns, each a dark seam with a faint lit edge.
  ctx.save()
  handleOutline(ctx, length)
  ctx.clip()
  ctx.lineWidth = 1.5

  for (let at = 8; at < length - 16; at += 8) {
    ctx.strokeStyle = 'rgba(20, 10, 4, 0.5)'
    ctx.beginPath()
    ctx.moveTo(at - 3, -GRIP_HALF)
    ctx.lineTo(at + 3, GRIP_HALF)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255, 224, 176, 0.14)'
    ctx.beginPath()
    ctx.moveTo(at - 1.3, -GRIP_HALF)
    ctx.lineTo(at + 4.7, GRIP_HALF)
    ctx.stroke()
  }

  ctx.restore()

  // The ferrule where the thong joins: a brushed metal band.
  const metal = ctx.createLinearGradient(0, -ROOT_HALF - 1, 0, ROOT_HALF + 1)
  metal.addColorStop(0, '#34322f')
  metal.addColorStop(0.32, '#f4f1ea')
  metal.addColorStop(0.55, '#96928a')
  metal.addColorStop(1, '#26241f')
  ctx.fillStyle = metal
  ctx.beginPath()
  ctx.roundRect(length - 13, -ROOT_HALF - 1.2, 15, 2 * ROOT_HALF + 2.4, 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(length - 9, -ROOT_HALF - 1)
  ctx.lineTo(length - 9, ROOT_HALF + 1)
  ctx.moveTo(length - 3, -ROOT_HALF - 1)
  ctx.lineTo(length - 3, ROOT_HALF + 1)
  ctx.stroke()

  // The pommel: a knob lit from the same side as the thong.
  const knob = ctx.createRadialGradient(-8, -5, 1, -4, 0, POMMEL)
  knob.addColorStop(0, '#f0c890')
  knob.addColorStop(0.45, '#7b4a25')
  knob.addColorStop(1, '#1f1008')
  ctx.fillStyle = knob
  ctx.beginPath()
  ctx.arc(-4, 0, POMMEL, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()
}

/** Draws the whole whip. `glow` 0..1 lights the handle as something to grab. */
export const drawWhip = (ctx: CanvasRenderingContext2D, whip: Whip, glow: number) => {
  drawThong(ctx, whip)
  drawHandle(ctx, whip, glow)
}

/** Whether a point is on the handle, generously: what a press can grab. */
export const isOnHandle = (whip: Whip, x: number, y: number): boolean => {
  const ax = whip.gripX - Math.cos(whip.angle) * (POMMEL + 3)
  const ay = whip.gripY - Math.sin(whip.angle) * (POMMEL + 3)
  const bx = whip.x[0]
  const by = whip.y[0]
  const ex = bx - ax
  const ey = by - ay
  const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey)))

  return Math.hypot(x - (ax + ex * t), y - (ay + ey * t)) <= GRAB_REACH
}
