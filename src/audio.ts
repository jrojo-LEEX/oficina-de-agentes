// The whip's sound: four real recordings of a whip crack, one per crack or
// per hit on the office's little Claudes. Nothing is synthesized, so the
// whip is silent until it cracks or lands.

import crack1 from './sounds/crack-1.wav?inline'
import crack2 from './sounds/crack-2.wav?inline'
import crack3 from './sounds/crack-3.wav?inline'
import crack4 from './sounds/crack-4.wav?inline'

const RECORDINGS = [crack1, crack2, crack3, crack4]

/** The bytes of a base64 data URL. */
const bytesOf = (dataUrl: string): ArrayBuffer => {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1))
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  return bytes.buffer
}

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo)

export class WhipAudio {
  private readonly ctx: AudioContext
  private readonly bus: GainNode
  private readonly master: GainNode
  private readonly analyser: AnalyserNode
  private readonly scope: Float32Array<ArrayBuffer>
  private cracks: AudioBuffer[] = []
  private lastCrack = -1
  private volume = 0.8
  private isMuted = false

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' })
    const { ctx } = this

    // Every crack meets on one bus, then a fast limiter so stacked cracks
    // never clip, then the volume.
    this.bus = ctx.createGain()
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -8
    limiter.knee.value = 2
    limiter.ratio.value = 20
    limiter.attack.value = 0.001
    limiter.release.value = 0.08
    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 2048
    this.scope = new Float32Array(this.analyser.fftSize)
    this.master = ctx.createGain()
    this.bus.connect(limiter).connect(this.analyser).connect(this.master).connect(ctx.destination)

    this.apply()
    void this.loadRecordings()
  }

  private async loadRecordings() {
    try {
      this.cracks = await Promise.all(RECORDINGS.map(url => this.ctx.decodeAudioData(bytesOf(url))))
    } catch (error) {
      console.error('No se pudieron cargar las grabaciones: el látigo queda sin sonido.', error)
    }
  }

  /** How many crack recordings are ready; 0 means the whip is silent. */
  get recordings(): number {
    return this.cracks.length
  }

  get state(): string {
    return this.ctx.state
  }

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume))
    this.apply()
  }

  setMuted(isMuted: boolean) {
    this.isMuted = isMuted
    this.apply()
  }

  private apply() {
    // Squared so the slider's low end is usable.
    const gain = this.isMuted ? 0 : this.volume * this.volume
    this.master.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.015)
  }

  suspend() {
    void this.ctx.suspend()
  }

  resume() {
    void this.ctx.resume()
  }

  /** One crack, starting now. `intensity` 0..1 from the detector. */
  crack(intensity: number) {
    const level = (0.62 + 0.38 * intensity) * rand(0.9, 1.08)

    if (this.cracks.length === 0) {
      return
    }

    // Never the same recording twice in a row, and never at quite the same
    // pitch: a harder crack is also a touch brighter.
    let pick = Math.floor(Math.random() * this.cracks.length)

    if (pick === this.lastCrack) {
      pick = (pick + 1) % this.cracks.length
    }

    this.lastCrack = pick
    const source = this.ctx.createBufferSource()
    source.buffer = this.cracks[pick]
    source.playbackRate.value = rand(0.94, 1.04) + 0.06 * intensity
    const gain = this.ctx.createGain()
    gain.gain.value = 1.25 * level
    source.connect(gain).connect(this.bus)
    source.start()
  }

  /** The loudest sample on the bus right now, before the volume: 0 is silence. */
  peak(): number {
    this.analyser.getFloatTimeDomainData(this.scope)
    let peak = 0

    for (const sample of this.scope) {
      peak = Math.max(peak, Math.abs(sample))
    }

    return peak
  }
}
