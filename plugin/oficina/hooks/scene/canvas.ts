// A pixel canvas for a grid of character cells: each cell is two pixels, one
// over the other, drawn with half-block characters. A cell can instead hold
// one character of text.

/** Colour 0 is transparent: the pane's own background shows through. */
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
  whipDark: 15,
  whipMid: 16,
  whipTan: 17,
  cream: 18,
  tear: 19,
} as const

/** The accent colours an agent's accessory takes, by its sequence number. */
export const ACCENTS = [11, 20, 21, 22, 12, 23] as const

export type Run = { text: string; color?: string; backgroundColor?: string }

export class Canvas {
  columns = 0
  rows = 0
  /** Width and height in pixels: `columns` by twice `rows`. */
  width = 0
  height = 0
  private px = new Uint8Array(0)
  private glyph: string[] = []
  private glyphColor = new Uint8Array(0)

  resize(columns: number, rows: number) {
    if (columns === this.columns && rows === this.rows) {
      return
    }

    this.columns = columns
    this.rows = rows
    this.width = columns
    this.height = rows * 2
    this.px = new Uint8Array(this.width * this.height)
    this.glyph = new Array<string>(columns * rows).fill('')
    this.glyphColor = new Uint8Array(columns * rows)
  }

  clear() {
    this.px.fill(0)
    this.glyph.fill('')
  }

  set(x: number, y: number, color: number) {
    const ix = Math.round(x)
    const iy = Math.round(y)

    if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height) {
      return
    }

    this.px[iy * this.width + ix] = color
    // A pixel drawn over a letter wins the cell.
    this.glyph[(iy >> 1) * this.columns + ix] = ''
  }

  rect(x: number, y: number, w: number, h: number, color: number) {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        this.set(x + i, y + j, color)
      }
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, color: number) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))))

    for (let s = 0; s <= steps; s++) {
      this.set(x0 + ((x1 - x0) * s) / steps, y0 + ((y1 - y0) * s) / steps, color)
    }
  }

  /** Writes text into a row of cells, clipped to the canvas; colour 0 is the theme's own. */
  text(column: number, row: number, text: string, color = 0) {
    if (row < 0 || row >= this.rows) {
      return
    }

    let at = Math.round(column)

    for (const char of text) {
      if (at >= 0 && at < this.columns) {
        this.glyph[row * this.columns + at] = char
        this.glyphColor[row * this.columns + at] = color
        this.px[row * 2 * this.width + at] = 0
        this.px[(row * 2 + 1) * this.width + at] = 0
      }

      at += 1
    }
  }

  /** Each row of cells as runs of one style, ready to become Text elements. */
  runs(): Run[][] {
    const out: Run[][] = []

    for (let row = 0; row < this.rows; row++) {
      const runs: Run[] = []
      let last: Run | null = null

      for (let column = 0; column < this.columns; column++) {
        const char = this.glyph[row * this.columns + column]!
        const top = this.px[row * 2 * this.width + column]!
        const bottom = this.px[(row * 2 + 1) * this.width + column]!
        let text = ' '
        let color: string | undefined
        let backgroundColor: string | undefined

        if (char !== '') {
          text = char
          color = PALETTE[this.glyphColor[row * this.columns + column]!] || undefined
        } else if (top !== 0 && top === bottom) {
          backgroundColor = PALETTE[top]
        } else if (top !== 0 && bottom !== 0) {
          text = '▀'
          color = PALETTE[top]
          backgroundColor = PALETTE[bottom]
        } else if (top !== 0) {
          text = '▀'
          color = PALETTE[top]
        } else if (bottom !== 0) {
          text = '▄'
          color = PALETTE[bottom]
        }

        if (last && last.color === color && last.backgroundColor === backgroundColor) {
          last.text += text
        } else {
          last = { text, color, backgroundColor }
          runs.push(last)
        }
      }

      out.push(runs)
    }

    return out
  }

  /** The colour at a pixel, 0 for none or outside: what a test reads. */
  at(x: number, y: number): number {
    return x < 0 || y < 0 || x >= this.width || y >= this.height ? 0 : this.px[y * this.width + x]!
  }
}
