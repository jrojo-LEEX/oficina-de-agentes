// Decides when a swing is a crack: the tip's speed has to climb past a high
// threshold, peak, and start falling. One gesture fires once.

export type CrackConfig = {
  /** Tip speed a peak must reach to count, px/s. */
  fire: number
  /** Tip speed the whip must fall back under before it can crack again. */
  rearm: number
  /** Seconds that must pass between two cracks, whatever the speed does. */
  minInterval: number
}

export const CRACK: CrackConfig = {
  fire: 7000,
  rearm: 2600,
  minInterval: 0.22,
}

export type Crack = {
  /** 0 for a peak right at the threshold, 1 for one twice as fast or more. */
  intensity: number
  /** The peak tip speed, px/s. */
  speed: number
}

export class CrackDetector {
  private readonly cfg: CrackConfig
  private isArmed = true
  private peak = 0
  private sinceLast = Infinity

  constructor(cfg: CrackConfig = CRACK) {
    this.cfg = cfg
  }

  /** Feed the tip speed once per simulation step. */
  update(speed: number, h: number): Crack | null {
    this.sinceLast += h

    if (!this.isArmed) {
      if (speed < this.cfg.rearm && this.sinceLast >= this.cfg.minInterval) {
        this.isArmed = true
        this.peak = 0
      }

      return null
    }

    if (speed >= this.peak) {
      this.peak = speed

      return null
    }

    // Past the peak: the crack is the moment the tip starts to lose speed.
    if (this.peak >= this.cfg.fire && speed < this.peak * 0.88) {
      const crack = {
        intensity: Math.min(1, (this.peak - this.cfg.fire) / this.cfg.fire),
        speed: this.peak,
      }
      this.isArmed = false
      this.sinceLast = 0
      this.peak = 0

      return crack
    }

    if (speed < this.cfg.rearm) {
      this.peak = 0
    }

    return null
  }
}
