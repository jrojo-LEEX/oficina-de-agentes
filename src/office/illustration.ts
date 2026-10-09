// The office drawn as flat illustration in Claude's warm colours: a dark,
// lived-in room (windows onto the city, shelves, pictures, a clock, hanging
// lamps, rugs) and terracotta characters in two flat tones. It is laid on the
// same office-pixel grid the simulation uses, so every desk, pose and hit box
// stays where it was. Nothing here decides anything: the poses come from
// actors.ts and the props from props.ts; this only says how they look.
// Drawn with the context already moved to the office's origin and scaled to
// one unit per office pixel, so shapes may sit between pixels.

import type { Pose } from './actors.ts'
import type { Prop } from './props.ts'
import type { Look } from './sprites.ts'
import type { OficinaAgent } from './types.ts'

export type Mood = 'normal' | 'night' | 'party'

type Ctx = CanvasRenderingContext2D

/** The palette: Claude's terracotta and cream, sand, oak and warm charcoal. */
export const P = {
  room: '#1E1916',
  roomNight: '#141623',
  wall: '#2A221D',
  wallNight: '#1C1D2B',
  wainscot: '#241D19',
  wainscotNight: '#181926',
  rail: '#3A3029',
  floor: '#4A3527',
  floorNight: '#332A2A',
  seam: '#3B2A1F',
  floorLit: '#5E4433',
  rug: '#7E4331',
  rugEdge: '#9A5640',
  body: '#D97757',
  bodyShade: '#C2603F',
  bodyRim: '#EBA184',
  limb: '#B5573A',
  ink: '#2B1B14',
  cream: '#F2E6D8',
  sand: '#C9A66B',
  sandShade: '#A88649',
  oak: '#B98E62',
  oakShade: '#94704A',
  oakDark: '#6E5238',
  charcoal: '#2B2622',
  charcoalLit: '#3D3631',
  steel: '#4A423C',
  glass: '#171311',
  olive: '#8A9A6B',
  oliveShade: '#6A7A50',
  mustard: '#D9A441',
  mustardShade: '#B07F27',
  sage: '#8FBF7A',
  brick: '#D9534F',
  slate: '#7F8C99',
  deep: '#8C3F2A',
  text: '#F2E6D8',
  textDim: '#A8998A',
  title: '#EBA184',
} as const

/** What a character wears, by its number: warm accents only. */
const ACCENT = [P.cream, P.sand, P.olive, P.mustard, P.deep, P.slate] as const

const mix = (from: string, to: string, t: number) => {
  const a = [1, 3, 5].map(i => parseInt(from.slice(i, i + 2), 16))
  const b = [1, 3, 5].map(i => parseInt(to.slice(i, i + 2), 16))

  return `#${a.map((v, i) => Math.round(v + (b[i]! - v) * t).toString(16).padStart(2, '0')).join('')}`
}

export const alpha = (color: string, a: number) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16))

  return `rgba(${r}, ${g}, ${b}, ${a})`
}

const darker = (color: string, t = 0.2) => mix(color, '#000000', t)

const rounded = (x: number, y: number, w: number, h: number, r: number) => {
  const path = new Path2D()
  path.roundRect(x, y, Math.max(0.01, w), Math.max(0.01, h), Math.max(0, Math.min(r, w / 2, h / 2)))

  return path
}

const ellipse = (cx: number, cy: number, rx: number, ry: number, rotation = 0) => {
  const path = new Path2D()
  path.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), rotation, 0, Math.PI * 2)

  return path
}

/**
 * Flat tones down a shape from `y` to `y + h`, as a gradient whose stops
 * meet: hard edges, no blending, and one fill instead of a clip per tone.
 * `bands` are [colour, where it ends as a share of the height].
 */
const tones = (ctx: Ctx, y: number, h: number, bands: readonly (readonly [string, number])[]) => {
  const g = ctx.createLinearGradient(0, y, 0, y + Math.max(0.01, h))
  let from = 0

  for (const [color, to] of bands) {
    g.addColorStop(Math.max(0, Math.min(1, from)), color)
    g.addColorStop(Math.max(0, Math.min(1, to)), color)
    from = to
  }

  return g
}

/**
 * The style's one way of filling a shape: a flat colour, and a flat second
 * tone across its lower part, in a single fill.
 */
const flat = (ctx: Ctx, path: Path2D, base: string, y: number, h: number, shade = darker(base), share = 0.34) => {
  ctx.fillStyle = share > 0 ? tones(ctx, y, h, [[base, 1 - share], [shade, 1]]) : base
  ctx.fill(path)
}

/** A flat shadow where something meets the floor. */
const contact = (ctx: Ctx, cx: number, cy: number, rx: number, ry: number, strength = 0.32) => {
  ctx.fillStyle = `rgba(0, 0, 0, ${strength})`
  ctx.fill(ellipse(cx, cy, rx, ry))
}

/** Light thrown on what is around it, kept faint: the style draws its light rather than casts it. */
const glow = (ctx: Ctx, cx: number, cy: number, r: number, color: string, strength: number) => {
  if (strength <= 0) return

  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
  g.addColorStop(0, alpha(color, strength))
  g.addColorStop(1, alpha(color, 0))
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = g
  ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r)
  ctx.restore()
}

const capsule = (ctx: Ctx, x0: number, y0: number, x1: number, y1: number, width: number, color: string) => {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()
}

/** A small number from a position, the same every frame: what keeps the room's furniture in place. */
const pick = (n: number, mod: number) => (((n * 2654435761) >>> 0) % 1000) % mod

// --- The room ------------------------------------------------------------------------------

/** The panel the office sits in, in screen pixels: dark enough to read over any window. */
export const drawPanel = (ctx: Ctx, mood: Mood, x: number, y: number, w: number, h: number) => {
  ctx.fillStyle = alpha(mood === 'night' ? P.roomNight : mood === 'party' ? '#231722' : P.room, 0.96)
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 16)
  ctx.fill()
}

/** The window's view: the sky by the mood, the city's roofs, the lit windows across the street. */
const drawWindow = (ctx: Ctx, x: number, y: number, w: number, h: number, mood: Mood, seed: number) => {
  const frame = rounded(x - 0.45, y - 0.45, w + 0.9, h + 0.9, 0.6)
  ctx.fillStyle = P.rail
  ctx.fill(frame)
  const pane = rounded(x, y, w, h, 0.3)
  ctx.save()
  ctx.clip(pane)

  // The sky in flat bands.
  const bands = mood === 'night' ? ['#1D2443', '#252D52', '#2F3762'] : mood === 'party' ? ['#5B3550', '#874A5C', '#B86A63'] : ['#C98A68', '#DDA27C', '#E9BE92']
  bands.forEach((color, i) => {
    ctx.fillStyle = color
    ctx.fillRect(x, y + (h * i) / 3, w, h / 3 + 0.05)
  })

  if (mood === 'night') {
    ctx.fillStyle = P.cream
    ctx.fill(ellipse(x + w * 0.74, y + h * 0.24, 0.7, 0.7))
    ctx.fillStyle = bands[0]!
    ctx.fill(ellipse(x + w * 0.74 + 0.35, y + h * 0.24 - 0.2, 0.6, 0.6))

    for (let i = 0; i < 4; i++) {
      // Stars of different brightness, held still: the room is drawn once.
      ctx.fillStyle = alpha(P.cream, 0.45 + pick(seed + i * 3, 5) / 10)
      ctx.fillRect(x + 0.6 + pick(seed + i * 7, 60) / 10, y + 0.4 + pick(seed + i * 13, 25) / 10, 0.18, 0.18)
    }
  } else {
    // A low sun behind the roofs.
    ctx.fillStyle = alpha('#F6D7A8', 0.85)
    ctx.fill(ellipse(x + w * (0.3 + pick(seed, 40) / 100), y + h * 0.68, 1.3, 1.3))
  }

  // Two rows of roofs, the far one paler.
  for (const [row, color, base] of [[0, mood === 'night' ? '#2A2F4A' : '#A9705A', 0.62], [1, mood === 'night' ? '#191B2C' : '#6E4A3C', 0.8]] as const) {
    let bx = x - 0.5

    for (let i = 0; bx < x + w; i++) {
      const bw = 1.3 + pick(seed + i * 31 + row * 97, 14) / 10
      const bh = h * (1 - base) + pick(seed + i * 17 + row * 53, 20) / 10
      ctx.fillStyle = color
      ctx.fillRect(bx, y + h - bh, bw, bh)

      if (row === 1) {
        // Lit windows across the street, more of them at night.
        ctx.fillStyle = alpha('#F2D3A0', mood === 'night' ? 0.85 : 0.5)

        for (let wy = y + h - bh + 0.45; wy < y + h - 0.3; wy += 0.75) {
          for (let wx = bx + 0.3; wx < bx + bw - 0.3; wx += 0.6) {
            if (pick(Math.round(wx * 10 + wy * 100) + seed, mood === 'night' ? 3 : 5) === 0) ctx.fillRect(wx, wy, 0.25, 0.3)
          }
        }
      }

      bx += bw + 0.15
    }
  }

  ctx.restore()
  // The frame's bars and sill.
  ctx.fillStyle = P.rail
  ctx.fillRect(x + w / 2 - 0.15, y, 0.3, h)
  ctx.fillRect(x, y + h * 0.45 - 0.15, w, 0.3)
  ctx.fillStyle = P.oakDark
  ctx.fill(rounded(x - 0.8, y + h + 0.3, w + 1.6, 0.55, 0.2))
}

/** A shelf with books leaning on it, and now and then a small plant. */
const drawShelf = (ctx: Ctx, x: number, y: number, w: number, seed: number) => {
  const books = [P.body, P.cream, P.sand, P.olive, P.deep, P.slate, P.mustard]
  let bx = x + 0.4

  for (let i = 0; bx < x + w - 1.2; i++) {
    const bw = 0.55 + pick(seed + i * 11, 4) / 10
    const bh = 2 + pick(seed + i * 23, 12) / 10
    const lean = pick(seed + i * 5, 7) === 0 ? 0.28 : 0
    ctx.save()
    ctx.translate(bx, y)
    ctx.rotate(lean)
    ctx.fillStyle = books[pick(seed + i * 41, books.length)]!
    ctx.fillRect(0, -bh, bw, bh)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)'
    ctx.fillRect(0, -bh + 0.35, bw, 0.18)
    ctx.restore()
    bx += bw + (lean ? 0.5 : 0.08)
  }

  if (pick(seed, 2) === 0) drawPottedPlant(ctx, x + w - 0.9, y, 0.8)

  ctx.fillStyle = P.oak
  ctx.fill(rounded(x, y, w, 0.5, 0.15))
  ctx.fillStyle = P.oakShade
  ctx.fillRect(x + 0.2, y + 0.5, w - 0.4, 0.2)
}

/** A plant in a terracotta pot standing on `y`, scaled by `k`. */
const drawPottedPlant = (ctx: Ctx, x: number, y: number, k: number, sway = 0) => {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(k, k)

  for (const [angle, length] of [[-0.7, 2.6], [-0.2, 3.2], [0.35, 2.9], [0.85, 2.2]] as const) {
    ctx.save()
    ctx.translate(0, -1.6)
    ctx.rotate(angle + sway)
    flat(ctx, ellipse(0, -length / 2, 0.65, length / 2), P.olive, -length, length, P.oliveShade, 0.5)
    ctx.restore()
  }

  const pot = new Path2D()
  pot.moveTo(-1.2, -1.8)
  pot.lineTo(1.2, -1.8)
  pot.lineTo(0.85, 0)
  pot.lineTo(-0.85, 0)
  pot.closePath()
  flat(ctx, pot, P.limb, -1.8, 1.8, P.deep, 0.4)
  ctx.fillStyle = P.bodyShade
  ctx.fillRect(-1.3, -1.95, 2.6, 0.4)
  ctx.restore()
}

/** Two small framed pictures: a sun over hills, and a Claude spark. */
const drawFrames = (ctx: Ctx, x: number, y: number, seed: number) => {
  const pictures = [
    { dx: 0, w: 3.2, h: 2.4 },
    { dx: 3.9, w: 2.2, h: 2.8 },
  ]

  for (const [index, one] of pictures.entries()) {
    const fx = x + one.dx
    const fy = y + (index === 1 ? -0.3 : 0)
    ctx.fillStyle = P.oakDark
    ctx.fill(rounded(fx - 0.3, fy - 0.3, one.w + 0.6, one.h + 0.6, 0.2))
    ctx.fillStyle = P.cream
    ctx.fillRect(fx, fy, one.w, one.h)

    if ((index + seed) % 2 === 0) {
      ctx.fillStyle = P.mustard
      ctx.fill(ellipse(fx + one.w * 0.66, fy + one.h * 0.38, 0.45, 0.45))
      ctx.fillStyle = P.olive
      ctx.beginPath()
      ctx.moveTo(fx, fy + one.h)
      ctx.quadraticCurveTo(fx + one.w * 0.35, fy + one.h * 0.35, fx + one.w * 0.7, fy + one.h)
      ctx.fill()
      ctx.fillStyle = P.oliveShade
      ctx.beginPath()
      ctx.moveTo(fx + one.w * 0.35, fy + one.h)
      ctx.quadraticCurveTo(fx + one.w * 0.75, fy + one.h * 0.5, fx + one.w, fy + one.h * 0.75)
      ctx.lineTo(fx + one.w, fy + one.h)
      ctx.fill()
    } else {
      // Claude's spark: rays round a centre.
      const cx = fx + one.w / 2
      const cy = fy + one.h / 2
      capsule(ctx, cx, cy, cx, cy, 0.01, P.body)

      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4
        capsule(ctx, cx + Math.cos(a) * 0.25, cy + Math.sin(a) * 0.25, cx + Math.cos(a) * 0.85, cy + Math.sin(a) * 0.85, 0.28, P.body)
      }
    }
  }
}

/** A round wall clock's face; its hands go on top, every frame (see `drawClockHands`). */
const drawClock = (ctx: Ctx, cx: number, cy: number) => {
  ctx.fillStyle = P.oakDark
  ctx.fill(ellipse(cx, cy, 1.55, 1.55))
  ctx.fillStyle = P.cream
  ctx.fill(ellipse(cx, cy, 1.25, 1.25))
}

/** A wall clock's hands, at the real time. */
export const drawClockHands = (ctx: Ctx, cx: number, cy: number, now: Date) => {
  const minutes = now.getMinutes() + now.getSeconds() / 60
  const hours = (now.getHours() % 12) + minutes / 60
  const hand = (turns: number, length: number, width: number) => {
    const a = turns * Math.PI * 2 - Math.PI / 2
    capsule(ctx, cx, cy, cx + Math.cos(a) * length, cy + Math.sin(a) * length, width, P.ink)
  }
  hand(hours / 12, 0.6, 0.22)
  hand(minutes / 60, 0.95, 0.16)
  ctx.fillStyle = P.body
  ctx.fill(ellipse(cx, cy, 0.2, 0.2))
}

/** The round the wall's furniture follows, every ten pixels along a row. */
const WALL = ['window', 'shelf', 'frames', 'window', 'high-shelf', 'clock', 'shelf', 'window', 'frames', 'high-shelf'] as const

/**
 * Each row of desks in its own room: the wall with its windows, shelves,
 * pictures and clock, the wainscot, and the boards underfoot. The furniture
 * is placed from the row and column, so it never moves between frames.
 */
export const drawRoom = (ctx: Ctx, mood: Mood, width: number, height: number, band: number, feet: number) => {
  const isNight = mood === 'night'
  /** Where the clocks hang: their hands are drawn over the cached room. */
  const clocks: { x: number; y: number }[] = []

  for (let top = 0, row = 0; top < height; top += band, row++) {
    const floor = top + feet + 1
    ctx.fillStyle = isNight ? P.wallNight : P.wall
    ctx.fillRect(0, top, width, floor - top)

    // Things on the wall, one every ten pixels, in a round that never repeats
    // side by side: windows, shelves, pictures, and one clock a row at most.
    for (let x = 0, k = 0; x + 9 <= width; x += 10, k++) {
      const kind = WALL[(k + row * 3) % WALL.length]!
      const seed = row * 101 + k * 37

      if (kind === 'window') drawWindow(ctx, x + 1.6, top + 1.6, 6.6, 4.8, mood, seed)
      else if (kind === 'shelf') drawShelf(ctx, x + 0.8, top + 4.8, 8, seed)
      else if (kind === 'frames') drawFrames(ctx, x + 1.6, top + 2.2, seed)
      else if (kind === 'clock' && k === (row * 5 + 2) % Math.max(1, Math.floor(width / 10))) {
        drawClock(ctx, x + 5, top + 3.6)
        clocks.push({ x: x + 5, y: top + 3.6 })
      }
      else if (kind === 'clock') drawFrames(ctx, x + 1.6, top + 2.2, seed + 1)
      else drawShelf(ctx, x + 1.4, top + 3.4, 6.5, seed)
    }

    // The wainscot along the bottom of the wall, under a rail.
    ctx.fillStyle = isNight ? P.wainscotNight : P.wainscot
    ctx.fillRect(0, floor - 4.2, width, 4.2)
    ctx.fillStyle = P.rail
    ctx.fillRect(0, floor - 4.4, width, 0.35)

    // The boards underfoot, their seams, and a lit edge where they meet the wall.
    const boards = Math.min(band - feet - 1, 8)
    ctx.fillStyle = isNight ? P.floorNight : P.floor
    ctx.fillRect(0, floor, width, boards)
    ctx.fillStyle = P.seam

    for (let y = floor + 2.2; y < floor + boards; y += 2.2) ctx.fillRect(0, y, width, 0.14)

    for (let x = 3 + (row % 2) * 5, i = 0; x < width; x += 9 + pick(i + row * 13, 5), i++) {
      ctx.fillRect(x, floor + 2.2 * (i % 3), 0.14, 2.2)
    }

    ctx.fillStyle = P.floorLit
    ctx.fillRect(0, floor, width, 0.3)
  }

  return clocks
}

/** A rug under a desk and its chair, on the boards. */
export const drawRug = (ctx: Ctx, x: number, floor: number, w: number) => {
  ctx.fillStyle = P.rug
  ctx.fill(rounded(x, floor + 0.15, w, 1.5, 0.35))
  ctx.fillStyle = P.rugEdge
  ctx.fillRect(x + 0.5, floor + 0.55, w - 1, 0.16)
  ctx.fillRect(x + 0.5, floor + 1.1, w - 1, 0.16)
}

/** A desk lamp, lit at night, and the warm pool of light it throws on the desk. */
export const drawDeskLamp = (ctx: Ctx, x: number, floor: number) => {
  glow(ctx, x - 1.5, floor - 4.6, 7, '#FFC86B', 0.2)
  capsule(ctx, x, floor - 4.1, x, floor - 6.4, 0.3, P.steel)
  capsule(ctx, x, floor - 6.4, x - 1.3, floor - 7.3, 0.3, P.steel)
  const shade = new Path2D()
  shade.moveTo(x - 0.7, floor - 8.1)
  shade.lineTo(x - 3, floor - 7.2)
  shade.lineTo(x - 2.3, floor - 6.3)
  shade.closePath()
  flat(ctx, shade, P.mustard, floor - 8.1, 1.8, P.mustardShade, 0.4)
  ctx.fillStyle = '#FFF1C9'
  ctx.fill(ellipse(x - 2.4, floor - 6.55, 0.42, 0.26))
  ctx.fillStyle = P.steel
  ctx.fill(rounded(x - 0.9, floor - 4.5, 1.8, 0.45, 0.2))
}
/** The corridor between the wings: a long runner on the boards. */
export const drawCorridor = (ctx: Ctx, x: number, w: number, height: number) => {
  ctx.fillStyle = alpha(P.rug, 0.5)
  ctx.fillRect(x + 1, 0, w - 2, height)
  ctx.fillStyle = alpha(P.rugEdge, 0.6)
  ctx.fillRect(x + 1.6, 0, 0.18, height)
  ctx.fillRect(x + w - 1.78, 0, 0.18, height)
}

/** The party's string of lights across the top of a row. */
export const drawGarland = (ctx: Ctx, width: number, top: number, t: number, isCalm: boolean) => {
  const sag = (x: number) => top + 1.2 + Math.abs(Math.sin((x / width) * Math.PI * 4)) * 0.9
  ctx.strokeStyle = alpha(P.cream, 0.45)
  ctx.lineWidth = 0.15
  ctx.beginPath()

  for (let x = 0; x <= width; x += 0.5) {
    if (x === 0) ctx.moveTo(x, sag(x))
    else ctx.lineTo(x, sag(x))
  }

  ctx.stroke()
  const bulbs = [P.mustard, P.cream, P.body, P.olive]
  const blink = isCalm ? 0 : Math.floor(t * 3)

  for (let x = 1.5, i = 0; x < width; x += 3, i++) {
    const isOn = (i + blink) % 3 !== 0
    const color = bulbs[i % bulbs.length]!

    if (isOn) glow(ctx, x, sag(x) + 0.7, 1.8, color, 0.3)

    ctx.fillStyle = isOn ? color : darker(color, 0.45)
    ctx.fill(ellipse(x, sag(x) + 0.7, 0.45, 0.6))
  }
}

// --- Desks ---------------------------------------------------------------------------------

/** What the screen shows and the colour it throws on whoever faces it. */
const screenLight = (agent: OficinaAgent | undefined, beat: number): { color: string; strength: number } => {
  const status = agent?.status ?? 'unknown'
  const activity = agent?.activity ?? 'working'

  if (status === 'unknown') return { color: P.slate, strength: 0.03 }
  if (status === 'done') return { color: P.sage, strength: 0.14 }
  if (status === 'failed') return { color: P.brick, strength: 0.18 }
  if (status === 'idle') return { color: P.slate, strength: 0.04 }
  if (activity === 'waiting') return { color: P.mustard, strength: beat % 2 === 0 ? 0.2 : 0.08 }

  return { color: '#FFD9A0', strength: 0.08 }
}

/**
 * The screen's picture, inside (`x`, `y`, `w`, `h`). Drawn every frame over
 * the cached monitor, so it keeps inside its glass without a clip.
 */
const drawScreenPicture = (ctx: Ctx, x: number, y: number, w: number, h: number, status: string, activity: string, beat: number, phase: number) => {
  const screen = rounded(x, y, w, h, 0.35)
  const lit = (color: string) => {
    ctx.fillStyle = color
    ctx.fill(screen)
  }
  const bar = (bx: number, by: number, bw: number, color: string) => {
    ctx.fillStyle = color
    ctx.fill(rounded(bx, by, bw, 0.3, 0.15))
  }
  const sign = (draw: () => void) => {
    ctx.strokeStyle = P.cream
    ctx.lineWidth = 0.32
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    draw()
    ctx.stroke()
  }

  if (status === 'done') {
    lit(P.sage)
    sign(() => {
      ctx.moveTo(x + w * 0.32, y + h * 0.52)
      ctx.lineTo(x + w * 0.46, y + h * 0.72)
      ctx.lineTo(x + w * 0.72, y + h * 0.3)
    })
  } else if (status === 'failed') {
    lit(P.brick)
    sign(() => {
      ctx.moveTo(x + w * 0.38, y + h * 0.3)
      ctx.lineTo(x + w * 0.62, y + h * 0.7)
      ctx.moveTo(x + w * 0.62, y + h * 0.3)
      ctx.lineTo(x + w * 0.38, y + h * 0.7)
    })
  } else if (status === 'idle') {
    lit(P.glass)
    ctx.fillStyle = alpha(P.slate, 0.6)
    ctx.fill(ellipse(x + w / 2, y + h / 2, 0.3, 0.3))
  } else if (status === 'running' && activity === 'waiting') {
    lit(beat % 2 === 0 ? P.mustard : '#6E5326')
    ctx.fillStyle = P.ink
    ctx.fill(rounded(x + w / 2 - 0.16, y + h * 0.2, 0.32, h * 0.4, 0.16))
    ctx.fill(ellipse(x + w / 2, y + h * 0.78, 0.18, 0.18))
  } else if (status === 'running' && activity === 'tool') {
    // A progress bar that fills and starts over.
    const p = phase
    lit(P.glass)
    ctx.fillStyle = alpha(P.cream, 0.12)
    ctx.fill(rounded(x + 0.4, y + h / 2 - 0.25, w - 0.8, 0.5, 0.25))
    ctx.fillStyle = P.sage
    ctx.fill(rounded(x + 0.4, y + h / 2 - 0.25, Math.max(0.5, (w - 0.8) * p), 0.5, 0.25))
  } else if (status === 'running' && (activity === 'reading' || activity === 'searching')) {
    lit(P.glass)
    ctx.fillStyle = P.cream
    ctx.fill(rounded(x + 0.35, y + 0.3, w - 0.7, h - 0.6, 0.2))

    for (let i = 0; i < 3; i++) bar(x + 0.65, y + 0.55 + i * 0.5, (w - 1.3) * (i === 2 ? 0.6 : 1), alpha(P.ink, 0.3))

    if (activity === 'searching') {
      const sx = x + 0.9 + phase * (w - 1.8)
      ctx.strokeStyle = P.body
      ctx.lineWidth = 0.2
      ctx.beginPath()
      ctx.arc(sx, y + h * 0.5, 0.45, 0, Math.PI * 2)
      ctx.stroke()
    }
  } else if (status === 'running') {
    // Lines of code scrolling by, in the room's own colours: each one shown
    // while it is inside the glass.
    lit(P.glass)
    const colors = activity === 'editing' ? [P.mustard, P.body, P.cream] : [P.sand, P.cream, P.body]
    const scroll = phase * 0.6

    for (let i = 0; i < 5; i++) {
      const ly = y + 0.35 + i * 0.6 - scroll

      if (ly < y + 0.2 || ly > y + h - 0.5) continue

      const indent = ((((i + beat) % 3) + 3) % 3) * 0.35
      const length = 0.8 + (((((i * 7 + beat * 3) % 5) + 5) % 5) / 5) * (w - 1.6)
      bar(x + 0.35 + indent, ly, Math.min(length, w - 0.7 - indent), colors[(((i + beat) % 3) + 3) % 3]!)
    }
  } else {
    lit(P.glass)
  }
}
/** A monitor whose frame spans (`x`, `top`) to `w` by `h`, on a stand down to `foot`. */
const drawMonitor = (ctx: Ctx, x: number, top: number, w: number, h: number, foot: number) => {
  const cx = x + w / 2
  ctx.fillStyle = P.steel
  ctx.fillRect(cx - 0.32, top + h - 0.2, 0.64, foot - top - h + 0.2)
  ctx.fill(rounded(cx - 1.25, foot - 0.4, 2.5, 0.45, 0.2))
  flat(ctx, rounded(x, top, w, h, 0.6), P.charcoalLit, top, h, P.charcoal, 0.3)
}

/** A desk top from `x` across `w`, at `top`, with legs down to the floor. */
const drawDeskTop = (ctx: Ctx, x: number, top: number, w: number, floor: number, legs: number[]) => {
  contact(ctx, x + w / 2, floor + 0.35, w * 0.5, 0.45, 0.28)

  for (const lx of legs) {
    ctx.fillStyle = P.oakDark
    ctx.fill(rounded(lx, top + 0.6, 0.75, floor - top - 0.6, 0.25))
  }

  ctx.fillStyle = P.oak
  ctx.fill(rounded(x, top - 0.2, w, 1.3, 0.45))
  ctx.fillStyle = P.oakShade
  ctx.fill(rounded(x + 0.15, top + 0.65, w - 0.3, 0.45, 0.2))
}

/** The chair behind a seated character: a back and seat on one wheeled foot. */
const drawChair = (ctx: Ctx, x: number, floor: number, isBoss: boolean) => {
  const back = isBoss ? 8.6 : 5.6
  const color = isBoss ? P.deep : P.charcoalLit
  const shade = isBoss ? darker(P.deep, 0.25) : P.charcoal
  flat(ctx, rounded(x - (isBoss ? 0.6 : 0.2), floor - back, isBoss ? 1.9 : 1.5, back - 0.6, 0.7), color, floor - back, back, shade, 0.3)
  ctx.fillStyle = color
  ctx.fill(rounded(x - 0.2, floor - 1.35, 4.6, 1.1, 0.5))
  ctx.fillStyle = P.steel
  ctx.fillRect(x + 1.9, floor - 0.3, 0.45, 0.85)
  ctx.fill(rounded(x + 0.7, floor + 0.45, 2.9, 0.3, 0.15))
  ctx.fillStyle = P.charcoal
  ctx.fill(ellipse(x + 0.8, floor + 0.85, 0.28, 0.28))
  ctx.fill(ellipse(x + 3.5, floor + 0.85, 0.28, 0.28))
}

/** A desk, its chair and its monitor: what stays put, drawn into the cached room. */
export const drawDeskFurniture = (ctx: Ctx, x: number, floor: number) => {
  drawChair(ctx, x, floor, false)
  const dx = x + 12
  drawDeskTop(ctx, dx - 1.2, floor - 4, 9.4, floor + 1, [dx, dx + 6])
  drawMonitor(ctx, dx + 0.7, floor - 9.4, 5.6, 4.1, floor - 4)
}

/** A screen's sprite box: its glass, from its top left corner. */
const SCREEN_BOX: Box = { x0: 0, y0: 0, x1: 4.4, y1: 2.9 }

/**
 * What a screen shows at time `t`, reduced to what tells its pictures apart:
 * the phase of its animation in 24 steps, which no eye splits further at this size.
 */
const screenOf = (agent: OficinaAgent | undefined, t: number, seq: number) => {
  const status = agent?.status ?? 'unknown'
  const activity = agent?.activity ?? 'working'
  const isRunning = status === 'running'
  const isCode = isRunning && !['waiting', 'tool', 'reading', 'searching'].includes(activity)
  const speed = activity === 'tool' ? 0.6 : activity === 'searching' ? 0.8 : 1.6 / 0.6
  const isMoving = isRunning && (isCode || activity === 'tool' || activity === 'searching')
  const phase = isMoving ? Math.floor((((t + seq * 0.37) * speed) % 1) * 24) / 24 : 0
  const beat = Math.floor(t * 4 + seq)
  const step = isRunning && activity === 'waiting' ? beat % 2 : isCode ? beat % 15 : 0

  return { status, activity, phase, beat: step, key: `screen:${status}:${activity}:${step}:${phase}` }
}

/** The monitor's screen, showing what the agent is observably doing: a sprite, every frame. */
export const drawDeskScreen = (ctx: Ctx, sprites: Sprites, x: number, floor: number, agent: OficinaAgent | undefined, t: number, seq: number) => {
  const one = screenOf(agent, t, seq)
  sprites.draw(ctx, one.key, SCREEN_BOX, x + 13.3, floor - 8.8, c => drawScreenPicture(c, 0, 0, 4.4, 2.9, one.status, one.activity, one.beat, one.phase))
}
/**
 * The boss's desk, two desks wide: a high-backed chair, a long desk with a
 * drawer, two monitors and a plant. What stays put, for the cached room.
 */
export const drawBossFurniture = (ctx: Ctx, x: number, floor: number) => {
  drawChair(ctx, x, floor, true)
  const dx = x + 12
  drawDeskTop(ctx, dx - 1.2, floor - 4, 26.4, floor + 1, [dx, dx + 23])
  flat(ctx, rounded(dx + 15, floor - 2.9, 7, 3, 0.45), P.oak, floor - 2.9, 3, P.oakShade, 0.3)
  ctx.fillStyle = P.mustard
  ctx.fill(rounded(dx + 17.6, floor - 1.9, 1.8, 0.35, 0.17))
  drawMonitor(ctx, dx + 0.7, floor - 9.4, 5.6, 4.1, floor - 4)
  drawMonitor(ctx, dx + 7.7, floor - 9.4, 5.6, 4.1, floor - 4)
  drawPottedPlant(ctx, dx + 20.5, floor - 4.1, 1.05)
}

/** The boss's two screens: its work, and a bar chart that never stops growing. */
export const drawBossScreens = (ctx: Ctx, sprites: Sprites, x: number, floor: number, agent: OficinaAgent | undefined, t: number, seq: number, isCalm: boolean) => {
  const dx = x + 12
  const one = screenOf(agent, t, seq)
  sprites.draw(ctx, one.key, SCREEN_BOX, dx + 1.3, floor - 8.8, c => drawScreenPicture(c, 0, 0, 4.4, 2.9, one.status, one.activity, one.beat, one.phase))
  const grow = isCalm ? 12 : Math.round(((Math.sin(t * 1.3) + 1) / 2) * 24)
  sprites.draw(ctx, `chart:${grow}`, SCREEN_BOX, dx + 8.3, floor - 8.8, c => {
    c.fillStyle = P.glass
    c.fill(rounded(0, 0, 4.4, 2.9, 0.35))
    ;[0.9, 1.4 + (grow / 24) * 0.4, 1.9 + (grow / 24) * 0.5].forEach((bh, i) => {
      c.fillStyle = i === 2 ? P.body : P.sand
      c.fill(rounded(0.65 + i * 1.15, 2.5 - bh, 0.75, bh, 0.18))
    })
  })
}
/** The light the monitor casts back over the desk and the face before it. */
export type Glow = { x: number; floor: number; agent: OficinaAgent | undefined; seq: number }

const GLOW_BOX: Box = { x0: -8, y0: -8, x1: 8, y1: 8 }

/**
 * Every monitor's light at once, in one pass of added light: a kept bitmap
 * of the glow per colour, laid at each screen's strength.
 */
export const drawScreenGlows = (ctx: Ctx, sprites: Sprites, glows: readonly Glow[], t: number) => {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'

  for (const one of glows) {
    const light = screenLight(one.agent, Math.floor(t * 4 + one.seq))

    if (light.strength <= 0) continue

    ctx.globalAlpha = Math.min(1, light.strength)
    sprites.draw(ctx, `glow:${light.color}`, GLOW_BOX, one.x + 14.5, one.floor - 7.3, c => {
      const g = c.createRadialGradient(0, 0, 0, 0, 0, 8)
      g.addColorStop(0, alpha(light.color, 1))
      g.addColorStop(1, alpha(light.color, 0))
      c.fillStyle = g
      c.fillRect(-8, -8, 16, 16)
    })
  }

  ctx.restore()
}

// --- Characters ----------------------------------------------------------------------------

/** A pose as it is drawn: the same pose, its moves eased so nothing jumps a whole pixel at once. */
export type Shown = { dx: number; dy: number; squash: number }

const star = (cx: number, cy: number, r: number, turn: number) => {
  const path = new Path2D()

  for (let i = 0; i < 10; i++) {
    const a = turn + (i * Math.PI) / 5 - Math.PI / 2
    const rr = i % 2 === 0 ? r : r * 0.45
    const px = cx + Math.cos(a) * rr
    const py = cy + Math.sin(a) * rr

    if (i === 0) path.moveTo(px, py)
    else path.lineTo(px, py)
  }

  path.closePath()

  return path
}

const drop = (cx: number, cy: number, r: number) => {
  const path = new Path2D()
  path.moveTo(cx, cy - r * 1.8)
  path.bezierCurveTo(cx + r * 0.2, cy - r, cx + r, cy - r * 0.2, cx + r, cy + r * 0.25)
  path.arc(cx, cy + r * 0.25, r, 0, Math.PI)
  path.bezierCurveTo(cx - r, cy - r * 0.2, cx - r * 0.2, cy - r, cx, cy - r * 1.8)

  return path
}

const drawEyes = (ctx: Ctx, eyes: Pose['eyes'], el: number, er: number, ey: number) => {
  ctx.fillStyle = P.ink
  ctx.strokeStyle = P.ink
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 0.32

  if (eyes === 'open') {
    for (const ex of [el, er]) {
      ctx.fillStyle = P.ink
      ctx.fill(ellipse(ex, ey + 0.95, 0.44, 0.74))
      ctx.fillStyle = P.cream
      ctx.fill(ellipse(ex + 0.15, ey + 0.65, 0.14, 0.16))
    }
  } else if (eyes === 'closed') {
    for (const ex of [el, er]) {
      ctx.beginPath()
      ctx.arc(ex, ey + 0.9, 0.5, Math.PI * 0.1, Math.PI * 0.9)
      ctx.stroke()
    }
  } else if (eyes === 'happy') {
    for (const ex of [el, er]) {
      ctx.beginPath()
      ctx.arc(ex, ey + 1.25, 0.5, Math.PI * 1.15, Math.PI * 1.85)
      ctx.stroke()
    }
  } else if (eyes === 'pain') {
    ctx.beginPath()
    ctx.moveTo(el - 0.5, ey + 0.4)
    ctx.lineTo(el + 0.35, ey + 0.95)
    ctx.lineTo(el - 0.5, ey + 1.5)
    ctx.moveTo(er + 0.5, ey + 0.4)
    ctx.lineTo(er - 0.35, ey + 0.95)
    ctx.lineTo(er + 0.5, ey + 1.5)
    ctx.stroke()
  } else {
    // Wide, or looking to a side: whites with a pupil.
    const look = eyes === 'right' ? 0.25 : eyes === 'left' ? -0.25 : 0

    for (const ex of [el, er]) {
      ctx.fillStyle = P.cream
      ctx.fill(ellipse(ex, ey + 0.95, 0.7, 0.85))
      ctx.fillStyle = P.ink
      ctx.fill(ellipse(ex + look, ey + (look === 0 ? 0.9 : 1.1), 0.34, 0.42))
    }
  }
}

const drawCrown = (ctx: Ctx, cx: number, top: number, w: number) => {
  const half = Math.min(3, w * 0.36)
  const base = top - 0.15
  const path = new Path2D()
  path.moveTo(cx - half, base)
  path.lineTo(cx - half - 0.15, base - 2)
  path.lineTo(cx - half * 0.45, base - 1.05)
  path.lineTo(cx, base - 2.5)
  path.lineTo(cx + half * 0.45, base - 1.05)
  path.lineTo(cx + half + 0.15, base - 2)
  path.lineTo(cx + half, base)
  path.closePath()
  flat(ctx, path, P.mustard, base - 2.5, 2.5, P.mustardShade, 0.35)
  ctx.fillStyle = P.deep
  ctx.fill(ellipse(cx, base - 0.8, 0.4, 0.4))
}

const drawAccessory = (ctx: Ctx, kind: number, accent: string, bx: number, top: number, w: number, h: number) => {
  const mid = bx + w / 2

  if (kind === 0) {
    // A cap, its peak out to the front.
    const cap = new Path2D()
    cap.moveTo(bx + 0.6, top + 0.3)
    cap.quadraticCurveTo(bx + 0.8, top - 2, mid, top - 2)
    cap.quadraticCurveTo(bx + w - 0.8, top - 2, bx + w - 0.6, top + 0.3)
    cap.closePath()
    flat(ctx, cap, accent, top - 2, 2.3)
    ctx.fillStyle = darker(accent, 0.25)
    ctx.fill(rounded(bx + w - 2.2, top - 0.2, 3.2, 0.6, 0.3))
  } else if (kind === 1) {
    // Headphones over the top.
    ctx.strokeStyle = darker(accent, 0.2)
    ctx.lineWidth = 0.45
    ctx.beginPath()
    ctx.arc(mid, top + 1, w / 2 - 0.1, Math.PI * 1.08, Math.PI * 1.92)
    ctx.stroke()
    ctx.fillStyle = accent
    ctx.fill(rounded(bx - 0.45, top + 0.4, 1.1, 1.9, 0.5))
    ctx.fill(rounded(bx + w - 0.65, top + 0.4, 1.1, 1.9, 0.5))
  } else if (kind === 2) {
    // A scarf, one end hanging.
    ctx.fillStyle = accent
    ctx.fill(rounded(bx - 0.1, top + h - 1.4, w + 0.2, 1, 0.5))
    ctx.fillStyle = darker(accent, 0.15)
    ctx.fill(rounded(bx + w - 2.1, top + h - 0.8, 0.9, 1.7, 0.4))
  } else if (kind === 3) {
    // An antenna with a light.
    capsule(ctx, mid, top + 0.2, mid, top - 1.6, 0.25, P.steel)
    ctx.fillStyle = accent
    ctx.fill(ellipse(mid, top - 2, 0.55, 0.55))
  } else if (kind === 4) {
    // A bow on top.
    const bow = new Path2D()
    bow.moveTo(mid, top - 0.4)
    bow.lineTo(mid - 1.5, top - 1.4)
    bow.lineTo(mid - 1.5, top + 0.4)
    bow.closePath()
    bow.moveTo(mid, top - 0.4)
    bow.lineTo(mid + 1.5, top - 1.4)
    bow.lineTo(mid + 1.5, top + 0.4)
    bow.closePath()
    ctx.fillStyle = accent
    ctx.fill(bow)
    ctx.fillStyle = darker(accent, 0.25)
    ctx.fill(ellipse(mid, top - 0.5, 0.45, 0.45))
  } else {
    // A tie.
    const tie = new Path2D()
    tie.moveTo(mid - 0.4, top + h - 2.2)
    tie.lineTo(mid + 0.4, top + h - 2.2)
    tie.lineTo(mid + 0.6, top + h - 0.3)
    tie.lineTo(mid, top + h + 0.3)
    tie.lineTo(mid - 0.6, top + h - 0.3)
    tie.closePath()
    ctx.fillStyle = accent
    ctx.fill(tie)
  }
}

const drawLook = (ctx: Ctx, look: Exclude<Look, null>, bx: number, top: number, w: number, rx: number, ay: number, el: number, er: number, ey: number) => {
  if (look === 'explorer') {
    // A safari hat, its brim wider than the head, a band round the crown.
    const crown = new Path2D()
    crown.moveTo(bx + 1.3, top - 0.6)
    crown.quadraticCurveTo(bx + 1.6, top - 2.9, bx + w / 2, top - 2.9)
    crown.quadraticCurveTo(bx + w - 1.6, top - 2.9, bx + w - 1.3, top - 0.6)
    crown.closePath()
    flat(ctx, crown, P.sand, top - 2.9, 2.3, P.sandShade, 0.3)
    ctx.fillStyle = P.oakDark
    ctx.fillRect(bx + 1.35, top - 1.25, w - 2.7, 0.45)
    ctx.fillStyle = P.sandShade
    ctx.fill(ellipse(bx + w / 2, top - 0.45, w / 2 + 1.5, 0.55))
  } else if (look === 'plans') {
    // A rolled-up blueprint under the arm.
    ctx.save()
    ctx.translate(rx + 0.6, ay + 0.9)
    ctx.rotate(-0.25)
    flat(ctx, rounded(-0.2, -0.55, 4.6, 1.1, 0.55), P.slate, -0.55, 1.1, darker(P.slate, 0.25), 0.4)
    ctx.fillStyle = P.cream
    ctx.fill(ellipse(4.3, 0, 0.35, 0.55))
    ctx.restore()
  } else {
    // Reading glasses, round, a bridge between.
    ctx.strokeStyle = P.ink
    ctx.lineWidth = 0.2

    for (const ex of [el, er]) {
      ctx.fillStyle = alpha(P.cream, 0.18)
      ctx.fill(ellipse(ex, ey + 0.95, 0.92, 0.92))
      ctx.beginPath()
      ctx.arc(ex, ey + 0.95, 0.95, 0, Math.PI * 2)
      ctx.stroke()
    }

    ctx.beginPath()
    ctx.moveTo(el + 0.95, ey + 0.8)
    ctx.quadraticCurveTo((el + er) / 2, ey + 0.4, er - 0.95, ey + 0.8)
    ctx.stroke()
    void bx
    void top
    void w
  }
}

/** What a sprite covers around the point it is drawn at, in office pixels. */
export type Box = { x0: number; y0: number; x1: number; y1: number }

/**
 * Drawings kept as GPU bitmaps by what they show: drawn once, then copied
 * each frame, so a frame costs a copy per thing instead of every stroke of
 * it. The least recently used go first once there are `limit` of them.
 */
export class Sprites {
  private readonly kept = new Map<string, CanvasImageSource>()
  private readonly limit: number

  constructor(limit: number) {
    this.limit = limit
  }

  get size() {
    return this.kept.size
  }

  /** Draws `key` with its box at (`x`, `y`) in the context's units, painting it first if it is new. */
  draw(ctx: Ctx, key: string, box: Box, x: number, y: number, paint: (c: Ctx) => void) {
    const m = ctx.getTransform()
    const density = Math.hypot(m.a, m.b) || 1
    const id = `${density.toFixed(3)}|${key}`
    let image = this.kept.get(id)
    const w = Math.max(1, Math.ceil((box.x1 - box.x0) * density))
    const h = Math.max(1, Math.ceil((box.y1 - box.y0) * density))

    if (image) {
      // Most recently used goes last, so the oldest is first out.
      this.kept.delete(id)
      this.kept.set(id, image)
    } else {
      const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h })
      const c = canvas.getContext('2d') as Ctx
      c.setTransform(density, 0, 0, density, -box.x0 * density, -box.y0 * density)
      paint(c)
      image = 'transferToImageBitmap' in canvas ? canvas.transferToImageBitmap() : canvas
      this.kept.set(id, image)

      // Let go, not closed: one sprite can be drawn several times in a frame, and a closed bitmap would throw.
      if (this.kept.size > this.limit) this.kept.delete(this.kept.keys().next().value!)
    }

    if (m.b !== 0 || m.c !== 0) {
      // Turned (a prop in flight): no grid to lay it on.
      ctx.drawImage(image, x + box.x0, y + box.y0, w / density, h / density)

      return
    }

    // Laid on the device's pixel grid, one bitmap pixel to one screen pixel: as crisp as drawing it.
    const px = Math.round(m.a * (x + box.x0) + m.e)
    const py = Math.round(m.d * (y + box.y0) + m.f)
    ctx.drawImage(image, (px - m.e) / m.a, (py - m.f) / m.d, w / m.a, h / m.d)
  }
}

/** What a character's drawing covers around the point at its left foot, for its sprite. */
export const FIGURE_BOX: Box = { x0: -2.5, y0: -11.5, x1: 16.5, y1: 2 }

/** Everything a character's still drawing depends on: its sprite's name. */
export const figureKey = (pose: Pose, squash: number, seq: number, typing: boolean, sway: number, isBoss: boolean, look: Look) =>
  [pose.isFlat ? 'flat' : squash.toFixed(1), pose.legs, pose.arms, typing ? 1 : 0, sway.toFixed(1), pose.eyes, pose.prop, isBoss ? 'boss' : look ?? seq % 36].join(':')

/** The soft shadow under a character, smaller and fainter the higher it is. */
export const drawActorShadow = (ctx: Ctx, x: number, feet: number, shown: Shown) => {
  const lift = Math.max(0, -shown.dy)
  contact(ctx, x + shown.dx + 5, feet + 1.2, Math.max(2.2, 4.4 - lift * 0.22), 0.55, Math.max(0.1, 0.32 - lift * 0.025))
}

/**
 * One character's still drawing, its left foot at (`left`, `bottom`): body,
 * limbs, face and what it wears or holds. Nothing here moves with time, so
 * it can be kept as a sprite; what does move is in `drawActorEffects`.
 */
export const drawFigure = (ctx: Ctx, left: number, bottom: number, pose: Pose, squash: number, seq: number, typing: boolean, sway: number, isBoss: boolean, look: Look) => {
  const accent = ACCENT[seq % ACCENT.length]!
  const accessory = Math.floor(seq / ACCENT.length + seq) % 6

  if (pose.isFlat) {
    // On its back: a low wide body, eyes crossed out, legs in the air.
    for (const lx of [left + 2.2, left + 7]) capsule(ctx, lx, bottom - 1.6, lx + 0.4, bottom - 3.6, 0.8, P.limb)
    flat(ctx, rounded(left, bottom - 2.4, 10, 3.4, 1.6), P.body, bottom - 2.4, 3.4, P.bodyShade)
    ctx.strokeStyle = P.ink
    ctx.lineWidth = 0.3
    ctx.lineCap = 'round'
    ctx.beginPath()

    for (const ex of [left + 3, left + 7]) {
      ctx.moveTo(ex - 0.5, bottom - 1.3)
      ctx.lineTo(ex + 0.5, bottom - 0.3)
      ctx.moveTo(ex + 0.5, bottom - 1.3)
      ctx.lineTo(ex - 0.5, bottom - 0.3)
    }

    ctx.stroke()

    return
  }

  const w = 8 + 2 * squash
  const h = 5 - squash
  const legs = 2 - Math.max(0, squash)
  const bx = left + 1 - squash
  const top = bottom - legs - h + 1
  const bodyBottom = top + h

  // Legs, two pairs; a walk lifts one of each pair.
  for (const [index, lx] of [bx + 1, bx + 3, bx + w - 4, bx + w - 2].entries()) {
    const isLifted = legs > 1.5 && index % 2 === 0 && pose.legs === 1
    const length = isLifted ? legs - 0.9 : legs
    ctx.fillStyle = P.limb
    ctx.fill(rounded(lx + 0.05, bodyBottom - 0.6, 0.9, length + 0.6, 0.45))
  }

  // Arms.
  const ay = top + 2.3
  const lx = bx - 0.35
  const rx = bx + w + 0.35
  const arm = (x0: number, y0: number, x1: number, y1: number) => capsule(ctx, x0, y0, x1, y1, 1.05, P.bodyShade)

  if (pose.arms === 'down') {
    arm(lx + 0.4, ay, lx, ay + 0.9)
    arm(rx - 0.4, ay, rx, ay + 0.9)
  } else if (pose.arms === 'typeA' || pose.arms === 'typeB') {
    arm(lx + 0.4, ay, lx, ay + 0.9)
    arm(rx - 0.4, ay, rx + 1.1, (pose.arms === 'typeA') === typing ? ay - 0.1 : ay + 0.6)
  } else if (pose.arms === 'up') {
    arm(lx + 0.5, ay - 0.2, lx - 0.3, top - 1.5)
    arm(rx - 0.5, ay - 0.2, rx + 0.3, top - 1.5)
  } else if (pose.arms === 'raise' || pose.arms === 'wave') {
    arm(lx + 0.4, ay, lx, ay + 0.9)
    arm(rx - 0.5, ay - 0.2, rx + 0.2 + sway, top - 2.6)
  } else if (pose.arms !== 'cover') {
    arm(lx + 0.4, ay, lx, ay + 0.9)
    arm(rx - 0.4, ay, rx + 1.2, ay)
  }

  // The body: one soft rounded loaf in two flat tones, a lit rim along the top.
  const body = rounded(bx, top, w, h, Math.min(2.3, h * 0.48))
  ctx.fillStyle = tones(ctx, top, h, [[P.bodyRim, 0.42 / h], [P.body, 0.7], [P.bodyShade, 1]])
  ctx.fill(body)

  if (pose.arms === 'cover') {
    // Hands over the head.
    arm(bx + 0.4, top + 0.6, bx + 2.6, top - 0.6)
    arm(bx + w - 0.4, top + 0.6, bx + w - 2.6, top - 0.6)
  }

  // Eyes, and cheeks that blush when it is happy.
  const ey = top + 0.9
  const el = bx + 2.5
  const er = bx + w - 2.5
  drawEyes(ctx, pose.eyes, el, er, ey)

  if (pose.eyes === 'happy' || pose.eyes === 'closed') {
    ctx.fillStyle = alpha('#F2A0A0', 0.5)
    ctx.fill(ellipse(el - 0.6, ey + 2.05, 0.6, 0.33))
    ctx.fill(ellipse(er + 0.6, ey + 2.05, 0.6, 0.33))
  }

  if (isBoss) drawCrown(ctx, bx + w / 2, top, w)
  else if (look) drawLook(ctx, look, bx, top, w, rx, ay, el, er, ey)
  else drawAccessory(ctx, accessory, accent, bx, top, w, h)

  if (pose.prop === 'paper') {
    ctx.save()
    ctx.translate(rx + 1.9, ay - 0.6)
    ctx.rotate(0.12)
    flat(ctx, rounded(-1.4, -1.9, 2.8, 3.6, 0.3), P.cream, -1.9, 3.6, '#DCCFBE', 0.25)

    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = alpha(P.ink, 0.3)
      ctx.fill(rounded(-0.9, -1.2 + i * 0.85, i === 2 ? 1.1 : 1.8, 0.3, 0.15))
    }

    ctx.restore()
  } else if (pose.prop === 'lens') {
    capsule(ctx, rx + 0.6, ay + 0.6, rx + 1.8, ay - 0.7, 0.45, P.oakDark)
    ctx.fillStyle = alpha(P.cream, 0.25)
    ctx.fill(ellipse(rx + 2.7, ay - 1.7, 1.15, 1.15))
    ctx.strokeStyle = P.sand
    ctx.lineWidth = 0.38
    ctx.beginPath()
    ctx.arc(rx + 2.7, ay - 1.7, 1.3, 0, Math.PI * 2)
    ctx.stroke()
  }
}

/**
 * What moves around a character with time, drawn every frame over its
 * sprite: sweat, the crown's glint, stars, tears and confetti.
 */
export const drawActorEffects = (ctx: Ctx, x: number, feet: number, pose: Pose, shown: Shown, seq: number, t: number, isBoss: boolean) => {
  const left = x + shown.dx
  const bottom = feet + shown.dy

  if (!pose.isFlat) {
    const squash = shown.squash
    const w = 8 + 2 * squash
    const h = 5 - squash
    const legs = 2 - Math.max(0, squash)
    const bx = left + 1 - squash
    const top = bottom - legs - h + 1

    if (isBoss) {
      // Now and then a glint runs over the crown.
      const glint = (t * 0.35) % 1
      const half = Math.min(3, w * 0.36)

      if (glint < 0.1) {
        ctx.fillStyle = alpha(P.cream, 0.9)
        ctx.fill(star(bx + w / 2 - half + (glint / 0.1) * half * 2, top - 1.75, 0.5, 0))
      }
    }

    if (pose.hasSweat) {
      const fall = (t * 2) % 1
      ctx.fillStyle = alpha('#9CC9E8', 1 - fall * 0.6)
      ctx.fill(drop(bx + w + 0.2, top - 0.2 + fall * 1.6, 0.4))
    }
  }

  const headX = left + 5
  const headY = bottom - (pose.isFlat ? 5 : 9)

  if (pose.stars > 0) {
    const count = pose.hasBigStars ? 6 : 3
    const reach = pose.hasBigStars ? 6 : 4

    for (let k = 0; k < count; k++) {
      const a = pose.stars * 7 + (k * Math.PI * 2) / count
      ctx.fillStyle = P.mustard
      ctx.fill(star(headX + Math.cos(a) * reach, headY + Math.sin(a) * (reach * 0.4), pose.hasBigStars ? 0.95 : 0.75, pose.stars * 4 + k))
    }
  }

  if (pose.tears > 0) {
    const fall = (pose.tears * 2.2) % 1

    for (const [index, tx] of [left + 1, left + 9].entries()) {
      const p = (fall + index * 0.5) % 1
      ctx.fillStyle = alpha('#9CC9E8', 1 - p * 0.7)
      ctx.fill(drop(tx, bottom - 4 + p * 3.5, 0.38))
    }
  }

  if (pose.confetti > 0) {
    const colors = [P.mustard, P.cream, P.body, P.olive, P.sand]

    for (let k = 0; k < 7; k++) {
      const a = k * 1.1 + seq
      const r = 3 + pose.confetti * 3.4
      ctx.save()
      ctx.translate(headX + Math.cos(a) * r, headY - 1 + Math.sin(a) * r * 0.5 + pose.confetti * 3)
      ctx.rotate(pose.confetti * 9 + k)
      ctx.fillStyle = colors[k % colors.length]!
      ctx.fillRect(-0.45, -0.22, 0.9, 0.44)
      ctx.restore()
    }
  }
}
/** The bubble a mark over a head (`!`, `?`, `z`, `♪`) sits in, in screen pixels; marks sit on a middle baseline. */
export const drawBubble = (ctx: Ctx, x: number, y: number, size: number, color: string, pulse: number) => {
  const r = size * 0.62

  if (pulse > 0) {
    ctx.fillStyle = alpha(P.mustard, 0.18 + 0.2 * pulse)
    ctx.beginPath()
    ctx.arc(x, y, r * (1.35 + 0.25 * pulse), 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.fillStyle = P.wall
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(1, size * 0.08)
  ctx.stroke()
}

/** A mark's colour in this palette, from the pixel palette's index. */
export const markColor = (index: number) =>
  index === 12 ? P.mustard : index === 13 ? P.brick : index === 10 ? P.sage : index === 14 ? P.textDim : P.cream

// --- Things on the desks ------------------------------------------------------------------

/** A page with a folded corner over the monitor: someone else writes this file too. */
export const drawSharedPage = (ctx: Ctx, x: number, y: number) => {
  const page = new Path2D()
  page.moveTo(x, y)
  page.lineTo(x + 2.2, y)
  page.lineTo(x + 3, y + 0.8)
  page.lineTo(x + 3, y + 3.4)
  page.lineTo(x, y + 3.4)
  page.closePath()
  flat(ctx, page, P.mustard, y, 3.4, P.mustardShade, 0.3)
  ctx.fillStyle = P.cream
  ctx.beginPath()
  ctx.moveTo(x + 2.2, y)
  ctx.lineTo(x + 2.2, y + 0.8)
  ctx.lineTo(x + 3, y + 0.8)
  ctx.closePath()
  ctx.fill()
}

/** The last tool calls, one dot each under the desk: sage went well, brick did not. */
export const drawTrail = (ctx: Ctx, x: number, y: number, trail: readonly string[]) => {
  trail.forEach((outcome, index) => {
    ctx.fillStyle = outcome === 'ok' ? P.sage : P.brick
    ctx.fill(ellipse(x + index * 2 + 0.5, y + 0.5, 0.45, 0.45))
  })
}

/** A cup, a pencil, a folder or a loose sheet, where the physics left it. */
const PROP_BOX: Box = { x0: -1.6, y0: -1.3, x1: 1.6, y1: 1.3 }

/** A cup, a pencil, a folder or a loose sheet, where the physics left it: a kept sprite, turned while it flies. */
export const drawProp = (ctx: Ctx, sprites: Sprites, prop: Prop) => {
  const isUp = prop.state === 'rest' || prop.state === 'carried'
  const hasCoffee = prop.kind === 'cup' && prop.state === 'rest'
  const turn = prop.state === 'down' && prop.kind === 'cup' ? Math.PI / 2 : isUp ? 0 : (prop.vx * 0.05) % (Math.PI * 2)
  ctx.save()
  ctx.translate(prop.x + prop.w / 2, prop.y + prop.h / 2)
  ctx.rotate(turn)
  sprites.draw(ctx, `prop:${prop.kind}:${hasCoffee}`, PROP_BOX, 0, 0, c => drawPropShape(c, prop.kind, hasCoffee))
  ctx.restore()
}

const drawPropShape = (ctx: Ctx, kind: Prop['kind'], hasCoffee: boolean) => {
  if (kind === 'cup') {
    // A mug, its handle, coffee showing while it stands.
    flat(ctx, rounded(-0.9, -1.1, 1.6, 2.1, 0.35), P.cream, -1.1, 2.1, '#DCCFBE', 0.3)
    ctx.strokeStyle = P.cream
    ctx.lineWidth = 0.3
    ctx.beginPath()
    ctx.arc(0.85, -0.05, 0.5, -Math.PI / 2, Math.PI / 2)
    ctx.stroke()

    if (hasCoffee) {
      ctx.fillStyle = P.oakDark
      ctx.fill(ellipse(-0.1, -0.95, 0.65, 0.2))
    }
  } else if (kind === 'pencil') {
    ctx.fillStyle = P.mustard
    ctx.fill(rounded(-1.2, -0.25, 1.9, 0.5, 0.1))
    ctx.fillStyle = P.body
    ctx.fill(rounded(-1.45, -0.25, 0.4, 0.5, 0.15))
    ctx.fillStyle = '#E9CFA3'
    ctx.beginPath()
    ctx.moveTo(0.7, -0.25)
    ctx.lineTo(1.3, 0)
    ctx.lineTo(0.7, 0.25)
    ctx.closePath()
    ctx.fill()
  } else if (kind === 'folder') {
    flat(ctx, rounded(-1.2, -0.55, 2.4, 1.1, 0.2), P.olive, -0.55, 1.1, P.oliveShade, 0.4)
    ctx.fillStyle = P.cream
    ctx.fillRect(-0.9, -0.75, 1.5, 0.25)
  } else {
    ctx.fillStyle = P.cream
    ctx.fill(rounded(-1.1, -0.45, 2.2, 0.9, 0.12))
  }
}

/** The cleaning robot: a rounded body on wheels, a visor and a blinking light; not one of the agents. */
export const drawRobot = (ctx: Ctx, x: number, floor: number, t: number) => {
  contact(ctx, x + 2.5, floor + 0.6, 2.8, 0.45)
  flat(ctx, rounded(x, floor - 5, 5, 4.2, 1.4), P.sand, floor - 5, 4.2, P.sandShade, 0.3)
  ctx.fillStyle = P.glass
  ctx.fill(rounded(x + 0.8, floor - 4.1, 3.4, 1.2, 0.6))
  const look = Math.sin(t * 2) * 0.7
  ctx.fillStyle = P.mustard
  ctx.fill(ellipse(x + 2.5 + look - 0.6, floor - 3.5, 0.26, 0.26))
  ctx.fill(ellipse(x + 2.5 + look + 0.6, floor - 3.5, 0.26, 0.26))
  capsule(ctx, x + 2.5, floor - 5, x + 2.5, floor - 5.9, 0.22, P.steel)
  ctx.fillStyle = Math.floor(t * 4) % 2 === 0 ? P.brick : P.deep
  ctx.fill(ellipse(x + 2.5, floor - 6.2, 0.42, 0.42))
  ctx.fillStyle = P.charcoal
  ctx.fill(ellipse(x + 0.9, floor - 0.5, 0.7, 0.7))
  ctx.fill(ellipse(x + 4.1, floor - 0.5, 0.7, 0.7))
}
