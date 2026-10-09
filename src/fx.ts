// What a crack looks like: a streak behind the fast tip, then a flash, a
// ring and a few sparks where it broke.

type Flash = {
  x: number
  y: number
  age: number
  life: number
  intensity: number
  spikes: { angle: number; length: number }[]
}

type Spark = { x: number; y: number; vx: number; vy: number; age: number; life: number }

type TrailPoint = { x: number; y: number; speed: number }

/** Tip positions kept, one per simulation step: about a sixth of a second. */
const TRAIL_LENGTH = 40
/** Tip speeds, px/s, between which the streak fades in to full. */
const TRAIL_FROM = 3000
const TRAIL_FULL = 10000
const FLASH_LIFE = 0.2
const SPARK_GRAVITY = 900

export class Fx {
  private flashes: Flash[] = []
  private sparks: Spark[] = []
  private trail: TrailPoint[] = []

  /** True while anything here still has pixels to draw. */
  get isActive(): boolean {
    return (
      this.flashes.length > 0 ||
      this.sparks.length > 0 ||
      this.trail.some(point => point.speed > TRAIL_FROM)
    )
  }

  /** Once a simulation step: where the tip is and how fast. */
  pushTip(x: number, y: number, speed: number) {
    this.trail.push({ x, y, speed })

    if (this.trail.length > TRAIL_LENGTH) {
      this.trail.shift()
    }
  }

  /** A crack at a point; `dirX`/`dirY` is the tip's direction of travel. */
  crack(x: number, y: number, intensity: number, dirX: number, dirY: number) {
    const spikes = []
    const count = 6 + Math.round(intensity * 3)

    for (let i = 0; i < count; i++) {
      spikes.push({
        angle: (i / count) * Math.PI * 2 + Math.random() * 0.6,
        length: 0.7 + Math.random() * 0.9,
      })
    }

    this.flashes.push({ x, y, age: 0, life: FLASH_LIFE, intensity, spikes })

    const sparks = 6 + Math.round(intensity * 7)

    for (let i = 0; i < sparks; i++) {
      const angle = Math.atan2(dirY, dirX) + (Math.random() - 0.5) * 2.4
      const speed = 160 + Math.random() * (260 + 300 * intensity)
      this.sparks.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        age: 0,
        life: 0.22 + Math.random() * 0.25,
      })
    }
  }

  update(dt: number) {
    for (const flash of this.flashes) {
      flash.age += dt
    }

    for (const spark of this.sparks) {
      spark.age += dt
      spark.vy += SPARK_GRAVITY * dt
      spark.x += spark.vx * dt
      spark.y += spark.vy * dt
    }

    this.flashes = this.flashes.filter(flash => flash.age < flash.life)
    this.sparks = this.sparks.filter(spark => spark.age < spark.life)
  }

  /** Under the whip: the streak. */
  drawTrail(ctx: CanvasRenderingContext2D) {
    const { trail } = this
    // Butt caps: round ones would overlap at every joint and bead the streak.
    ctx.lineCap = 'butt'

    for (let i = 1; i < trail.length; i++) {
      const strength = Math.min(1, Math.max(0, (trail[i].speed - TRAIL_FROM) / (TRAIL_FULL - TRAIL_FROM)))

      if (strength === 0) {
        continue
      }

      const along = i / (trail.length - 1)
      ctx.strokeStyle = `rgba(255, 244, 220, ${0.42 * strength * along})`
      ctx.lineWidth = 1 + 3 * along * strength
      ctx.beginPath()
      ctx.moveTo(trail[i - 1].x, trail[i - 1].y)
      ctx.lineTo(trail[i].x, trail[i].y)
      ctx.stroke()
    }
  }

  /** Over the whip: flash, ring and sparks. */
  drawBursts(ctx: CanvasRenderingContext2D) {
    for (const flash of this.flashes) {
      const p = flash.age / flash.life
      const alpha = (1 - p) ** 1.5
      const grow = 1 - (1 - p) * (1 - p)
      const radius = (18 + 34 * flash.intensity) * (0.45 + 0.55 * grow)

      const glow = ctx.createRadialGradient(flash.x, flash.y, 0, flash.x, flash.y, radius)
      glow.addColorStop(0, `rgba(255, 255, 255, ${alpha})`)
      glow.addColorStop(0.3, `rgba(255, 226, 140, ${alpha * 0.8})`)
      glow.addColorStop(1, 'rgba(255, 170, 60, 0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(flash.x, flash.y, radius, 0, Math.PI * 2)
      ctx.fill()

      ctx.strokeStyle = `rgba(255, 246, 214, ${alpha})`
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.beginPath()

      for (const spike of flash.spikes) {
        const from = radius * 0.25
        const to = radius * spike.length * (0.7 + 0.6 * grow)
        ctx.moveTo(flash.x + Math.cos(spike.angle) * from, flash.y + Math.sin(spike.angle) * from)
        ctx.lineTo(flash.x + Math.cos(spike.angle) * to, flash.y + Math.sin(spike.angle) * to)
      }

      ctx.stroke()

      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.5})`
      ctx.lineWidth = 0.5 + 2 * (1 - p)
      ctx.beginPath()
      ctx.arc(flash.x, flash.y, 8 + 70 * grow * (0.6 + 0.4 * flash.intensity), 0, Math.PI * 2)
      ctx.stroke()
    }

    ctx.lineCap = 'round'
    ctx.lineWidth = 1.5

    for (const spark of this.sparks) {
      const alpha = 1 - spark.age / spark.life
      ctx.strokeStyle = `rgba(255, 212, 120, ${alpha})`
      ctx.beginPath()
      ctx.moveTo(spark.x, spark.y)
      ctx.lineTo(spark.x - spark.vx * 0.018, spark.y - spark.vy * 0.018)
      ctx.stroke()
    }
  }
}
