// A character's own life, apart from its agent's: walking in, working,
// celebrating, walking out, and reacting to the whip. The agent's real state
// only ever arrives as data; nothing here changes it.

import type { OficinaAgent, OficinaStatus } from './types.ts'

/** `dodge`: a slow whip it saw coming, ducked; not a hit. */
export type ReactionKind = 'light' | 'medium' | 'strong' | 'cover' | 'dodge'

/** Somebody else got it: `cheer` when the boss did, `laugh` when the desk beside did. */
export type Glee = 'cheer' | 'laugh'

export type Reaction = {
  kind: ReactionKind
  /** A crack landed right on it with the tip: flung farther, more stars. */
  isCritical: boolean
  /** Seconds in. */
  t: number
  dur: number
  /** Which way the whip was travelling. */
  dir: 1 | -1
  /** Counts up per character, so two reactions of a kind do not look alike. */
  variant: number
}

export type Actor = {
  id: string
  seq: number
  slot: number
  /** Seconds since it took its desk. */
  age: number
  /** The agent status this character last acted on. */
  seen: OficinaStatus
  /** Seconds of celebration left. */
  celebrate: number
  /** The agent finished mid-reaction: the celebration waits for it to end. */
  owesCelebration: boolean
  /** Seconds a failed agent's character still sits before leaving. */
  linger: number
  /** Seconds into walking out; negative while it is staying. */
  leave: number
  reaction: Reaction | null
  /** Scene-clock times of its recent hits. */
  hits: number[]
  variant: number
  isGone: boolean
  /** Seconds of glee left at someone else's expense, and which. */
  glee: number
  gleeKind: Glee
}

export const ENTER_SECONDS = 0.9
const CELEBRATE_SECONDS = 2.4
const LEAVE_SECONDS = 1.1
const FAILED_LINGER_SECONDS = 12
const HIT_COOLDOWN = 0.28
/** Hits within this many seconds count as consecutive. */
const FLURRY_WINDOW = 4
const FLURRY_HITS = 3

/** Whip speeds at the body, px/s: under `light` it is a graze and nothing happens. */
export const HIT = { light: 110, medium: 330, strong: 640 } as const

const DURATION: Record<ReactionKind, number> = { light: 0.55, medium: 1.05, strong: 1.9, cover: 1.3, dodge: 0.5 }
/** Under `light`, a whip this fast is seen coming and dodged; slower still, it goes unnoticed. */
const DODGE_SHARE = 0.35

export const seat = (agent: OficinaAgent, slot: number): Actor => ({
  id: agent.id,
  seq: agent.seq,
  slot,
  age: 0,
  seen: agent.status,
  celebrate: 0,
  owesCelebration: false,
  linger: agent.status === 'failed' ? FAILED_LINGER_SECONDS : 0,
  leave: -1,
  reaction: null,
  hits: [],
  variant: agent.seq,
  isGone: false,
  glee: 0,
  gleeKind: 'cheer',
})

/**
 * Moves the character on by `dt` and takes in its agent's latest status.
 * Returns whether it is in a moment that needs every frame drawn.
 */
export const advance = (actor: Actor, agent: OficinaAgent | undefined, dt: number): boolean => {
  actor.age += dt

  if (actor.reaction) {
    actor.reaction.t += dt

    if (actor.reaction.t >= actor.reaction.dur) {
      actor.reaction = null
    }
  }

  const status = agent?.status

  if (status !== undefined && status !== actor.seen) {
    actor.seen = status

    if (status === 'done') {
      // The real finish is never lost to a reaction: it is owed until it ends.
      actor.owesCelebration = true
    } else if (status === 'failed') {
      actor.linger = FAILED_LINGER_SECONDS
    } else {
      // Running again (a resumed agent): back to the desk.
      actor.celebrate = 0
      actor.owesCelebration = false
      actor.linger = 0
      actor.leave = -1
    }
  }

  if (actor.reaction === null) {
    if (actor.owesCelebration) {
      actor.owesCelebration = false
      actor.celebrate = CELEBRATE_SECONDS
    } else if (actor.celebrate > 0) {
      actor.celebrate -= dt

      if (actor.celebrate <= 0) {
        actor.celebrate = 0
        actor.leave = 0
      }
    } else if (actor.leave >= 0) {
      actor.leave += dt
      actor.isGone = actor.leave >= LEAVE_SECONDS
    } else if (agent === undefined) {
      actor.leave = 0
    } else if (actor.seen === 'failed') {
      actor.linger -= dt

      if (actor.linger <= 0) {
        actor.leave = 0
      }
    }
  }

  if (actor.glee > 0) {
    actor.glee = Math.max(0, actor.glee - dt)
  }

  return actor.reaction !== null || actor.celebrate > 0 || actor.leave >= 0 || actor.age < ENTER_SECONDS || actor.glee > 0
}

/**
 * The whip struck this character at `speed`, at scene time `clock`. Returns
 * the reaction it starts, or null for a graze or a hit inside the cooldown.
 */
export const strike = (actor: Actor, speed: number, dir: 1 | -1, clock: number, isCritical = false): ReactionKind | null => {
  if (speed < HIT.light) {
    // Slow enough to see coming: it ducks out of the way, nothing more.
    if (speed >= HIT.light * DODGE_SHARE && actor.reaction === null && !isCritical) {
      actor.variant += 1
      actor.reaction = { kind: 'dodge', t: 0, dur: DURATION.dodge, dir, variant: actor.variant, isCritical: false }

      return 'dodge'
    }

    return null
  }

  const last = actor.hits[actor.hits.length - 1]

  if (last !== undefined && clock - last < HIT_COOLDOWN) {
    return null
  }

  actor.hits = [...actor.hits.filter(at => clock - at < FLURRY_WINDOW), clock]
  actor.variant += 1

  const byForce: ReactionKind = speed >= HIT.strong ? 'strong' : speed >= HIT.medium ? 'medium' : 'light'
  // Under a flurry it mostly cowers, and still takes the odd hit head on.
  // A critical always sends it flying, flurry or not.
  const kind: ReactionKind = isCritical ? 'strong' : actor.hits.length >= FLURRY_HITS && actor.variant % 3 !== 0 ? 'cover' : byForce

  actor.reaction = { kind, t: 0, dur: DURATION[kind] * (isCritical ? 1.3 : 1), dir, variant: actor.variant, isCritical }

  return kind
}

/** Whether the character has been hit lately enough to fear the whip. */
export const isWary = (actor: Actor, clock: number) => actor.hits.some(at => clock - at < FLURRY_WINDOW)

// --- Poses ---------------------------------------------------------------------

export type Arms = 'down' | 'typeA' | 'typeB' | 'up' | 'cover' | 'raise' | 'wave' | 'hold'
export type Eyes = 'open' | 'closed' | 'wide' | 'pain' | 'right' | 'left' | 'happy'

export type Pose = {
  /** Pixels from the seat; `dy` negative is up. */
  dx: number
  dy: number
  /** 1 squashed (wide and short), -1 stretched (narrow and tall). */
  squash: -1 | 0 | 1
  arms: Arms
  eyes: Eyes
  /** Walk frame. */
  legs: 0 | 1
  isFlat: boolean
  prop: 'none' | 'paper' | 'lens'
  /** A character drawn over the head, with its palette colour. */
  mark: string
  markColor: number
  /** Phases for the effects around a hit; 0 draws none. */
  stars: number
  /** More stars, wider: what a critical hit leaves. */
  hasBigStars: boolean
  tears: number
  confetti: number
  hasSweat: boolean
}

const still = (): Pose => ({
  dx: 0,
  dy: 0,
  squash: 0,
  arms: 'down',
  eyes: 'open',
  legs: 0,
  isFlat: false,
  prop: 'none',
  mark: '',
  markColor: 0,
  stars: 0,
  tears: 0,
  confetti: 0,
  hasSweat: false,
  hasBigStars: false,
})

const easeOut = (p: number) => 1 - (1 - p) * (1 - p) * (1 - p)
const clamp01 = (p: number) => Math.max(0, Math.min(1, p))
/** A hop: 0 at both ends, 1 at the top. */
const arc = (p: number) => 4 * p * (1 - p)

const reactionPose = (pose: Pose, r: Reaction): Pose => {
  const p = r.t / r.dur
  const shake = Math.floor(r.t * 22 + r.variant) % 2 === 0 ? 1 : -1

  if (r.kind === 'dodge') {
    // A quick duck away from the whip, and a cheeky look back.
    const away = r.dir > 0 ? 1 : -1
    pose.dx = Math.round(away * 2 * arc(p))
    pose.squash = p < 0.6 ? 1 : 0
    pose.eyes = p < 0.6 ? 'wide' : 'happy'

    return pose
  }

  if (r.kind === 'light') {
    // Anticipation, a start, a shiver, and back.
    pose.squash = p < 0.14 ? 1 : p < 0.45 ? -1 : 0
    pose.dy = p >= 0.14 && p < 0.45 ? -1 : 0
    pose.dx = p > 0.3 && p < 0.8 ? shake : 0
    pose.eyes = r.variant % 2 === 0 ? 'closed' : 'wide'
    pose.arms = p < 0.45 ? 'up' : 'down'

    return pose
  }

  if (r.kind === 'medium') {
    const air = clamp01((p - 0.07) / 0.43)
    pose.squash = p < 0.07 ? 1 : p < 0.2 ? -1 : p >= 0.5 && p < 0.6 ? 1 : 0
    pose.dy = p >= 0.07 && p < 0.5 ? -Math.round(5 * arc(air)) : 0
    pose.arms = p < 0.6 ? 'up' : r.variant % 2 === 0 ? 'cover' : 'down'
    pose.eyes = p < 0.6 ? 'pain' : 'closed'
    pose.dx = p >= 0.6 && p < 0.92 ? shake : 0
    pose.tears = r.variant % 2 === 1 && p > 0.5 ? r.t : 0

    return pose
  }

  if (r.kind === 'strong') {
    // Flung, flat on the floor seeing stars, then up and back to the seat.
    const flung = clamp01(p / 0.24)
    const away = (r.dir > 0 ? -1 : 1) * (r.isCritical ? 2.5 : 1)

    if (p < 0.24) {
      pose.dx = Math.round(away * 2 * easeOut(flung))
      pose.dy = -Math.round((r.isCritical ? 10 : 6) * arc(flung))
      pose.squash = flung < 0.3 ? -1 : 0
      pose.arms = 'up'
      pose.eyes = 'pain'
    } else if (p < 0.62) {
      pose.dx = Math.round(away * 2)
      pose.isFlat = true
      pose.eyes = 'pain'

      if (r.isCritical) {
        pose.stars = r.t
        pose.hasBigStars = true
      } else if (r.variant % 2 === 0) pose.stars = r.t
      else pose.tears = r.t
    } else if (p < 0.76) {
      pose.dx = Math.round(away * 2)
      pose.squash = p < 0.69 ? 1 : -1
      pose.eyes = 'closed'
    } else {
      pose.dx = Math.round(away * 2 * (1 - clamp01((p - 0.76) / 0.2)))
      pose.legs = Math.floor(r.t * 10) % 2 === 0 ? 0 : 1
      pose.eyes = 'closed'
    }

    return pose
  }

  // Cover: crouched under its arms, watching the whip.
  pose.squash = 1
  pose.arms = 'cover'
  pose.eyes = r.dir > 0 ? 'left' : 'right'
  pose.dy = p < 0.12 ? -1 : 0
  pose.dx = p > 0.15 && p < 0.85 && Math.floor(r.t * 14) % 3 === 0 ? shake : 0
  pose.hasSweat = true

  return pose
}

/**
 * How the character looks at scene time `t`. The reaction, when there is
 * one, wins; under it sits whatever the agent's real state calls for.
 */
export const poseOf = (actor: Actor, agent: OficinaAgent | undefined, t: number, isAnimated: boolean): Pose => {
  const pose = still()
  // Each character keeps its own beat, so the office never moves in step.
  const beat = isAnimated ? t * (0.9 + (actor.seq % 5) * 0.07) + actor.seq * 1.7 : actor.seq * 1.7
  const status = agent?.status ?? actor.seen
  const activity = agent?.activity ?? 'working'

  if (actor.reaction) {
    return reactionPose(pose, actor.reaction)
  }

  if (actor.glee > 0 && actor.leave < 0) {
    if (actor.gleeKind === 'cheer') {
      // The boss got it: arms up, hopping.
      pose.arms = 'up'
      pose.eyes = 'happy'
      pose.dy = -Math.round(2 * arc((actor.glee * 2.5) % 1))
      pose.mark = '♪'
      pose.markColor = 10
    } else {
      // The one at the next desk got it: a giggle, shaking.
      pose.eyes = 'happy'
      pose.squash = Math.floor(actor.glee * 12) % 2 === 0 ? 1 : 0
    }

    return pose
  }

  if (actor.leave >= 0) {
    pose.dx = -Math.round(13 * clamp01(actor.leave / LEAVE_SECONDS))
    pose.legs = Math.floor(actor.leave * 9) % 2 === 0 ? 0 : 1
    pose.eyes = status === 'failed' ? 'closed' : 'happy'

    return pose
  }

  if (actor.celebrate > 0) {
    const hop = (CELEBRATE_SECONDS - actor.celebrate) * 2.2
    const up = arc(hop % 1)
    pose.dy = -Math.round(4 * up)
    pose.squash = up < 0.15 ? 1 : up > 0.7 ? -1 : 0
    pose.arms = 'up'
    pose.eyes = 'happy'
    pose.mark = '♪'
    pose.markColor = 10
    pose.confetti = CELEBRATE_SECONDS - actor.celebrate

    return pose
  }

  if (actor.age < ENTER_SECONDS) {
    pose.dx = -Math.round(13 * (1 - easeOut(actor.age / ENTER_SECONDS)))
    pose.legs = Math.floor(actor.age * 10) % 2 === 0 ? 0 : 1

    return pose
  }

  // Now and then a blink.
  if (beat % 3.3 < 0.14) {
    pose.eyes = 'closed'
  }

  if (status === 'unknown') {
    pose.mark = '?'
    pose.markColor = 14

    return pose
  }

  if (status === 'failed') {
    pose.squash = 1
    pose.eyes = 'closed'
    pose.mark = '!'
    pose.markColor = 13
    pose.hasSweat = true

    return pose
  }

  if (status === 'idle') {
    pose.eyes = 'closed'
    pose.mark = beat % 2 < 1 ? 'z' : 'Z'
    pose.markColor = 14

    return pose
  }

  if (status === 'done') {
    pose.eyes = 'happy'

    return pose
  }

  if (activity === 'waiting') {
    // Hand up and hopping: someone has to answer it.
    pose.arms = beat % 0.8 < 0.4 ? 'raise' : 'wave'
    pose.dy = beat % 0.8 < 0.2 ? -2 : 0
    pose.mark = '!'
    pose.markColor = 12

    return pose
  }

  if (activity === 'reading' || activity === 'searching') {
    pose.arms = 'hold'
    pose.prop = activity === 'reading' ? 'paper' : 'lens'

    if (pose.eyes === 'open') pose.eyes = beat % 1.6 < 0.8 ? 'right' : 'open'

    return pose
  }

  if (activity === 'tool') {
    if (pose.eyes === 'open') pose.eyes = 'right'
    pose.dy = beat % 1.2 < 0.6 ? 0 : -1

    return pose
  }

  // Working or editing: at the keys, editing at twice the pace.
  const pace = activity === 'editing' ? 9 : 5
  pose.arms = Math.floor(beat * pace) % 2 === 0 ? 'typeA' : 'typeB'

  return pose
}
