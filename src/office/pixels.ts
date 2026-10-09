// The office's pixel buffer: palette indices on a small grid, scaled up on
// screen without smoothing. A character over a head (`!`, `?`, `z`, `♪`) is
// kept apart as a mark and drawn as text.

/** Colour 0 is transparent. */
export const PALETTE = [
  '',
  '#D97757', // 1 terracotta
  '#B5573A', // 2 terracotta, shaded
  '#EFA17F', // 3 terracotta, lit
  '#2B1B14', // 4 eye
  '#F5F0E6', // 5 white
  '#8A5A33', // 6 desk
  '#5E3B1F', // 7 desk, shaded
  '#6B7280', // 8 monitor frame
  '#1E2430', // 9 screen, off
  '#7CD992', // 10 green
  '#6CB6FF', // 11 blue
  '#F5C542', // 12 yellow
  '#E5484D', // 13 red
  '#9AA0AA', // 14 grey
  '#5A3518', // 15 whip, dark
  '#A66A3A', // 16 whip, mid
  '#D9A066', // 17 whip, tan
  '#F2E6C8', // 18 cream
  '#7CC7FF', // 19 tear
  '#B58CFF', // 20 purple
  '#5FD0A8', // 21 teal
  '#F28FB1', // 22 pink
  '#FF9F5A', // 23 orange
] as const

export const C = {
  body: 1,
  shade: 2,
  lit: 3,
  eye: 4,
  white: 5,
  desk: 6,
  deskShade: 7,
  frame: 8,
  screen: 9,
  green: 10,
  blue: 11,
  yellow: 12,
  red: 13,
  grey: 14,
  tear: 19,
} as const

/** The accent colours an agent's accessory takes, by its sequence number. */
export const ACCENTS = [11, 20, 21, 22, 12, 23] as const

export type Mark = { x: number; y: number; text: string; color: number }

/** Each palette colour as RGBA bytes, for filling an ImageData. */
const RGBA = PALETTE.map(hex =>
  hex === '' ? [0, 0, 0, 0] : [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255],
)

export class Pixels {
  width = 0
  height = 0
  marks: Mark[] = []
  private px = new Uint8Array(0)

  resize(width: number, height: number) {
    if (width === this.width && height === this.height) {
      return
    }

    this.width = width
    this.height = height
    this.px = new Uint8Array(width * height)
  }

  clear() {
    this.px.fill(0)
    this.marks = []
  }

  set(x: number, y: number, color: number) {
    const ix = Math.round(x)
    const iy = Math.round(y)

    if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height) {
      return
    }

    this.px[iy * this.width + ix] = color
  }

  rect(x: number, y: number, w: number, h: number, color: number) {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        this.set(x + i, y + j, color)
      }
    }
  }

  /** A character drawn over the picture, centred on pixel `x`, its foot on pixel row `y`. */
  mark(x: number, y: number, text: string, color: number) {
    this.marks.push({ x, y, text, color })
  }

  /** A copy of every pixel's colour: one frame of film. */
  snapshot(): Uint8Array {
    return this.px.slice()
  }

  /** The colour at a pixel, 0 for none or outside. */
  at(x: number, y: number): number {
    return x < 0 || y < 0 || x >= this.width || y >= this.height ? 0 : this.px[y * this.width + x]
  }

  /** Writes the buffer into an ImageData of the same size. */
  paint(image: ImageData) {
    const { data } = image

    for (let i = 0; i < this.px.length; i++) {
      const rgba = RGBA[this.px[i]]
      const at = i * 4
      data[at] = rgba[0]
      data[at + 1] = rgba[1]
      data[at + 2] = rgba[2]
      data[at + 3] = rgba[3]
    }
  }
}
