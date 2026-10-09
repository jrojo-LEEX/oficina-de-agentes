// The office on film: frames kept as data (the office's palette pixels, the
// names under the desks, the whip's points), never as video of the screen,
// so nothing else on the desktop is ever recorded. The last seconds make a
// clip, a sparse reel of the whole session makes a timelapse, and either
// can be saved as a replay file another copy of the app plays back.
// Names under desks are kept; what each agent was doing, its files and its
// session are not.

import { PALETTE } from './office/pixels.ts'

export type FilmLabel = { text: string; x: number; y: number; color: string; size: number }

export type FilmFrame = {
  /** Epoch ms. */
  t: number
  /** The office's pixels: width, height, palette indices. */
  w: number
  h: number
  px: Uint8Array
  /** Screen pixels per office pixel when it was taken. */
  scale: number
  title: string
  labels: FilmLabel[]
  /** The whip's points, in screen pixels from the office's pixel origin; empty when it was far. */
  whip: number[]
}

export type ReplayFile = { format: 'latigo-replay'; version: 1; fps: number; frames: (Omit<FilmFrame, 'px'> & { px: string })[] }

/** Frames a second for the clip, and seconds it covers. */
export const CLIP_FPS = 15
export const CLIP_SECONDS = 12
/** A timelapse keeps one frame every this many ms, up to this many frames. */
const LAPSE_EVERY_MS = 3000
const LAPSE_MAX = 900
/** Room around the office's pixels in a rendered frame. */
const PAD = 10
const TITLE_H = 22
const FOOTER_H = 26
/** A replay file larger than this is refused. */
export const REPLAY_MAX_BYTES = 25 * 1024 * 1024

export class Film {
  private clip: FilmFrame[] = []
  private lapse: FilmFrame[] = []
  private lastClipAt = 0
  private lastLapseAt = 0

  /** Takes a frame if it is time for one; `make` builds it only then. */
  record(now: number, make: () => FilmFrame) {
    const isClipDue = now - this.lastClipAt >= 1000 / CLIP_FPS
    const isLapseDue = now - this.lastLapseAt >= LAPSE_EVERY_MS

    if (!isClipDue && !isLapseDue) return

    const frame = make()

    if (isClipDue) {
      this.lastClipAt = now
      this.clip.push(frame)
      this.clip = this.clip.filter(one => now - one.t <= CLIP_SECONDS * 1000)
    }

    if (isLapseDue) {
      this.lastLapseAt = now
      this.lapse.push(frame)

      if (this.lapse.length > LAPSE_MAX) {
        // Full: every other frame goes, so the reel still spans the whole session.
        this.lapse = this.lapse.filter((_, index) => index % 2 === 0)
      }
    }
  }

  get clipFrames() {
    return this.clip
  }

  get lapseFrames() {
    return this.lapse
  }
}

/** Base64 of bytes, and back: how pixels travel in a replay file. */
const toBase64 = (bytes: Uint8Array) => {
  let text = ''

  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))

  return btoa(text)
}

const fromBase64 = (text: string) => Uint8Array.from(atob(text), char => char.charCodeAt(0))

export const toReplay = (frames: FilmFrame[], fps = CLIP_FPS): ReplayFile => ({
  format: 'latigo-replay',
  version: 1,
  fps,
  frames: frames.map(frame => ({ ...frame, px: toBase64(frame.px) })),
})

/** A replay file read back, checked field by field; anything off is refused, nothing in it runs. */
export const fromReplay = (data: unknown): { fps: number; frames: FilmFrame[] } | null => {
  const file = data as Partial<ReplayFile> | null

  if (file?.format !== 'latigo-replay' || file.version !== 1 || !Array.isArray(file.frames)) return null

  const frames: FilmFrame[] = []

  for (const raw of file.frames.slice(0, 5000)) {
    const w = Number(raw?.w)
    const h = Number(raw?.h)

    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w * h > 200_000 || typeof raw.px !== 'string') return null

    const px = fromBase64(raw.px)

    if (px.length !== w * h) return null

    frames.push({
      t: Number(raw.t) || 0,
      w,
      h,
      px,
      scale: Math.max(1, Math.min(12, Number(raw.scale) || 6)),
      title: String(raw.title ?? '').slice(0, 200),
      labels: (Array.isArray(raw.labels) ? raw.labels : []).slice(0, 80).map(label => ({
        text: String(label?.text ?? '').slice(0, 60),
        x: Number(label?.x) || 0,
        y: Number(label?.y) || 0,
        color: /^#[0-9a-f]{6}$/i.test(String(label?.color)) ? String(label.color) : '#F5F0E6',
        size: Math.max(8, Math.min(24, Number(label?.size) || 12)),
      })),
      whip: (Array.isArray(raw.whip) ? raw.whip : []).slice(0, 400).map(value => Number(value) || 0),
    })
  }

  return frames.length > 0 ? { fps: Math.max(1, Math.min(30, Number(file.fps) || CLIP_FPS)), frames } : null
}

/** The size, in screen pixels, a frame is drawn at. */
export const frameSize = (frame: FilmFrame) => ({
  width: frame.w * frame.scale + 2 * PAD,
  height: frame.h * frame.scale + TITLE_H + FOOTER_H + 2 * PAD,
})

/** Draws one frame of film onto `ctx`, at (0, 0); `scratch` scales the pixels up crisp. */
export const drawFrame = (ctx: CanvasRenderingContext2D, scratch: HTMLCanvasElement, frame: FilmFrame, caption = '') => {
  const { width, height } = frameSize(frame)
  const s = frame.scale
  const ox = PAD
  const oy = PAD + TITLE_H
  ctx.save()
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = 'rgb(22, 22, 26)'
  ctx.fillRect(0, 0, width, height)
  ctx.font = '600 13px "Segoe UI", system-ui, sans-serif'
  ctx.fillStyle = '#EFA17F'
  ctx.textBaseline = 'middle'
  ctx.fillText(frame.title, PAD + 2, PAD + TITLE_H / 2 - 2, width - 2 * PAD)

  if (scratch.width !== frame.w || scratch.height !== frame.h) {
    scratch.width = frame.w
    scratch.height = frame.h
  }

  const sctx = scratch.getContext('2d')!
  const image = sctx.createImageData(frame.w, frame.h)

  for (let i = 0; i < frame.px.length; i++) {
    const hex = PALETTE[frame.px[i]!] ?? ''

    if (!hex) continue

    image.data[i * 4] = parseInt(hex.slice(1, 3), 16)
    image.data[i * 4 + 1] = parseInt(hex.slice(3, 5), 16)
    image.data[i * 4 + 2] = parseInt(hex.slice(5, 7), 16)
    image.data[i * 4 + 3] = 255
  }

  sctx.putImageData(image, 0, 0)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(scratch, ox, oy, frame.w * s, frame.h * s)
  ctx.textAlign = 'center'

  for (const label of frame.labels) {
    ctx.font = `${label.size}px "Segoe UI", system-ui, sans-serif`
    ctx.fillStyle = label.color
    ctx.fillText(label.text, ox + label.x, oy + label.y)
  }

  if (frame.whip.length >= 4) {
    // The whip as a thick brown line, thinning toward the tip.
    ctx.lineCap = 'round'

    for (let i = 2; i < frame.whip.length; i += 2) {
      const share = i / frame.whip.length
      ctx.strokeStyle = share > 0.85 ? '#F2E6C8' : share > 0.5 ? '#D9A066' : '#8A5A33'
      ctx.lineWidth = 6 - 4.5 * share
      ctx.beginPath()
      ctx.moveTo(ox + frame.whip[i - 2]!, oy + frame.whip[i - 1]!)
      ctx.lineTo(ox + frame.whip[i]!, oy + frame.whip[i + 1]!)
      ctx.stroke()
    }
  }

  if (caption) {
    ctx.textAlign = 'left'
    ctx.font = '12px "Segoe UI", system-ui, sans-serif'
    ctx.fillStyle = '#9AA0AA'
    ctx.fillText(caption, PAD + 2, height - PAD - 6, width - 2 * PAD)
  }

  ctx.restore()
}

/**
 * Renders frames into a WebM video, at `fps`, in real time (the browser's
 * recorder keeps the clock). Resolves the video's bytes.
 */
export const renderVideo = async (frames: FilmFrame[], fps: number, caption: (index: number) => string): Promise<ArrayBuffer> => {
  const size = frames.reduce((most, frame) => {
    const { width, height } = frameSize(frame)

    return { width: Math.max(most.width, width), height: Math.max(most.height, height) }
  }, { width: 2, height: 2 })
  const canvas = document.createElement('canvas')
  canvas.width = size.width + (size.width % 2)
  canvas.height = size.height + (size.height % 2)
  const ctx = canvas.getContext('2d')!
  const scratch = document.createElement('canvas')
  const stream = canvas.captureStream(fps)
  const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(one => MediaRecorder.isTypeSupported(one)) ?? 'video/webm'
  const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 4_000_000 })
  const chunks: Blob[] = []
  recorder.ondataavailable = event => event.data.size > 0 && chunks.push(event.data)
  const done = new Promise<void>(resolve => (recorder.onstop = () => resolve()))
  recorder.start()

  for (const [index, frame] of frames.entries()) {
    ctx.fillStyle = 'rgb(22, 22, 26)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    drawFrame(ctx, scratch, frame, caption(index))
    await new Promise(resolve => setTimeout(resolve, 1000 / fps))
  }

  recorder.stop()
  await done

  return new Blob(chunks, { type }).arrayBuffer()
}
