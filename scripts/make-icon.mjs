// Draws the app's icon from code, like the tray's: a little Claude with a
// crown at its desk, beside a monitor, on a dark rounded tile. Writes build/icon.png (256 px),
// which electron-builder turns into the .exe's icon. No image is shipped.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const SIZE = 256
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'build', 'icon.png')
const px = new Uint8Array(SIZE * SIZE * 4)

const hex = color => [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)]

/** Paints over what is there, `alpha` 0..1. */
const plot = (x, y, color, alpha = 1) => {
  x = Math.round(x)
  y = Math.round(y)

  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return

  const at = (y * SIZE + x) * 4
  const [r, g, b] = hex(color)
  const a = px[at + 3] / 255
  const out = alpha + a * (1 - alpha)
  px[at] = Math.round((r * alpha + px[at] * a * (1 - alpha)) / (out || 1))
  px[at + 1] = Math.round((g * alpha + px[at + 1] * a * (1 - alpha)) / (out || 1))
  px[at + 2] = Math.round((b * alpha + px[at + 2] * a * (1 - alpha)) / (out || 1))
  px[at + 3] = Math.round(out * 255)
}

// The tile: dark, rounded.
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const r = 44
    const dx = Math.max(r - x, x - (SIZE - 1 - r), 0)
    const dy = Math.max(r - y, y - (SIZE - 1 - r), 0)
    const cover = Math.max(0, Math.min(1, r + 0.5 - Math.hypot(dx, dy)))
    if (cover > 0) plot(x, y, '#16161A', cover)
  }
}

// The little Claude, in the office's pixels, 14 screen pixels each.
const P = 14
const ox = 40
const oy = 90
const cell = (x, y, w, h, color) => {
  for (let j = 0; j < h * P; j++) for (let i = 0; i < w * P; i++) plot(ox + x * P + i, oy + y * P + j, color)
}
cell(0, 2, 8, 5, '#D97757') // body
cell(0, 6, 8, 1, '#B5573A') // shade
cell(0, 2, 2, 1, '#EFA17F') // light
cell(1, 7, 1, 2, '#B5573A') // legs
cell(3, 7, 1, 2, '#B5573A')
cell(4, 7, 1, 2, '#B5573A')
cell(6, 7, 1, 2, '#B5573A')
cell(-1, 4, 1, 1, '#D97757') // arms
cell(8, 4, 1, 1, '#D97757')
cell(2, 3, 1, 2, '#2B1B14') // eyes
cell(5, 3, 1, 2, '#2B1B14')
cell(1, 1, 6, 1, '#F5C542') // crown
cell(1, 0, 1, 1, '#F5C542')
cell(4, 0, 1, 1, '#F5C542')
cell(6, 0, 1, 1, '#F5C542')
cell(4, 1, 1, 1, '#E5484D')

// Its desk: a monitor beside it with lines of work, on a wooden top.
const rect = (x0, y0, w, h, color) => {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) plot(x, y, color)
}
rect(150, 132, 76, 56, '#F5F0E6') // the monitor's frame
rect(156, 138, 64, 44, '#2B211C') // its screen
rect(162, 146, 30, 5, '#7CD992') // lines of work
rect(162, 156, 46, 5, '#F5F0E6')
rect(162, 166, 38, 5, '#D97757')
rect(182, 188, 12, 32, '#8A552A') // the stand
rect(24, 218, 208, 14, '#B07A4A') // the desk
rect(24, 232, 208, 6, '#8A552A')

// PNG: 8-bit RGBA, no interlace, one filter byte per row.
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = bytes => {
  let c = 0xffffffff
  for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'ascii')
  const sum = Buffer.alloc(4)
  sum.writeUInt32BE(crc(Buffer.concat([head.subarray(4), data])), 0)
  return Buffer.concat([head, data, sum])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8
ihdr[9] = 6
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1))
for (let y = 0; y < SIZE; y++) Buffer.from(px.buffer, y * SIZE * 4, SIZE * 4).copy(raw, y * (SIZE * 4 + 1) + 1)
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
])

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, png)
console.log(`icon: ${OUT}`)
