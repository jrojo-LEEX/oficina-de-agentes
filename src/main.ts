// The overlay's renderer: wires the mouse to the simulation, the simulation
// to the crack detector, and one crack event to both the sound and the flash.

import { WhipAudio } from './audio.ts'
import { CRACK, CrackDetector } from './crack.ts'
import type { Crack } from './crack.ts'
import { drawWhip, isOnHandle } from './draw.ts'
import { Fx } from './fx.ts'
import type { OverlayState } from './bridge.ts'
import { CLIP_FPS, drawFrame, Film, frameSize, fromReplay, renderVideo, toReplay } from './film.ts'
import type { FilmFrame } from './film.ts'
import { Achievements } from './office/achievements.ts'
import type { Achievement } from './office/achievements.ts'
import { DayLog } from './office/daylog.ts'
import { strikes } from './office/hits.ts'
import { elapsedOf, Office } from './office/office.ts'
import type { ReactionKind } from './office/actors.ts'
import { Stats } from './office/stats.ts'
import { FLICKS, handAt, phaseAt } from './selftest.ts'
import { Whip, WHIP_PROFILES } from './sim.ts'
import type { WhipProfile } from './sim.ts'
import { dailyOf, freshOf, hoursOf, limitLine, mergeLimits, PERIODS, shortTime, shortTokens, spendOf } from './spend.ts'
import type { Limit, Period, SpendSession } from './spend.ts'
import { Targets } from './targets.ts'
import { TRICK_NAMES, TrickReader } from './tricks.ts'

const EDGE = 40
const CONTROLS_MARGIN = 8
const HINT_SECONDS = 4.5
/** A hit sounds as a crack of the real recording, louder the harder it landed. */
const HIT_LOUDNESS: Record<ReactionKind, number> = { light: 0.25, medium: 0.6, strong: 1, cover: 0.45, dodge: 0 }
/** Hits closer together than this make a combo. */
const COMBO_GAP_MS = 1200
/** How long a combo's count stays on screen after its last hit. */
const COMBO_SHOW_MS = 900
/** How loud the crack that says someone waits for permission is. */
const ALERT_LOUDNESS = 0.55
const TOAST_MS = 3800
const STATUS_WORDS: Record<string, string> = { running: 'trabajando', idle: 'en espera', done: 'terminó', failed: 'falló', unknown: 'sin datos' }
/** Sounds closer together than this are one: a crack and the hit it made never double up. */
const SOUND_GAP_MS = 90
/** A tip landing this fast is a critical: the speed of a crack, give or take, for the whip in hand. */
const criticalOf = (profile: WhipProfile) => CRACK.fire * WHIP_PROFILES[profile].crackScale * 0.8

/** The crack detector for a whip: the same rule, its threshold moved with the thong's length. */
const detectorOf = (profile: WhipProfile) => {
  const scale = WHIP_PROFILES[profile].crackScale

  return new CrackDetector({ ...CRACK, fire: CRACK.fire * scale, rearm: CRACK.rearm * scale })
}

/** The renderer's own storage, or none where it is blocked: the counts then live in memory. */
const storage = () => {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

const canvas = document.getElementById('stage') as HTMLCanvasElement
const controls = document.getElementById('controls') as HTMLDivElement
const muteButton = document.getElementById('mute') as HTMLButtonElement
const volumeSlider = document.getElementById('volume') as HTMLInputElement
const hideButton = document.getElementById('hide') as HTMLButtonElement
const doneButton = document.getElementById('done') as HTMLButtonElement
const hint = document.getElementById('hint') as HTMLDivElement
const officeCanvas = document.getElementById('office') as HTMLCanvasElement
const card = document.getElementById('card') as HTMLDivElement
const toast = document.getElementById('toast') as HTMLDivElement
const report = document.getElementById('report') as HTMLElement
const reportTotals = document.getElementById('report-totals') as HTMLSpanElement
const reportList = document.getElementById('report-list') as HTMLOListElement
const reportClose = document.getElementById('report-close') as HTMLButtonElement
const player = document.getElementById('player') as HTMLElement
const playerCanvas = document.getElementById('player-canvas') as HTMLCanvasElement
const playerInfo = document.getElementById('player-info') as HTMLSpanElement
const spendPanel = document.getElementById('spend') as HTMLElement
const emptyBadge = document.getElementById('empty') as HTMLDivElement
const rosterList = document.getElementById('roster') as HTMLUListElement
const ctx = canvas.getContext('2d')!
const { overlay } = window

const clampToScreen = (point: { x: number; y: number }) => ({
  x: Math.max(EDGE, Math.min(innerWidth - EDGE, point.x)),
  y: Math.max(EDGE, Math.min(innerHeight - EDGE, point.y)),
})

const home = () => ({ x: innerWidth * 0.62, y: innerHeight * 0.26 })

const start = async () => {
  let state: OverlayState = await overlay.ready()
  const anchor = clampToScreen(state.isSelftest ? { x: innerWidth * 0.4, y: innerHeight * 0.35 } : (state.anchor ?? home()))
  let profile: WhipProfile = WHIP_PROFILES[state.whipProfile] ? state.whipProfile : 'classic'
  let whip = new Whip(anchor.x, anchor.y, WHIP_PROFILES[profile].cfg)
  let detector = detectorOf(profile)
  let criticalSpeed = criticalOf(profile)
  const targets = new Targets()
  const tricks = new TrickReader()
  let shout: { text: string; x: number; y: number; at: number } | null = null
  const fx = new Fx()
  const audio = new WhipAudio()
  const stats = new Stats(storage())
  const office = new Office(stats)
  const achievements = new Achievements(storage())
  const daylog = new DayLog(storage())
  const film = new Film()
  let isRendering = false
  let playback: { frames: FilmFrame[]; fps: number; index: number; speed: number; timer: number } | null = null
  let combo = 0
  let lastHitAt = Number.NEGATIVE_INFINITY
  let comboShown: { text: string; x: number; y: number; at: number } | null = null
  let toastTimer = 0
  let waitingBefore = new Set<string>()
  const officeScratch = document.createElement('canvas')
  const octx = officeCanvas.getContext('2d')!
  let lastSoundAt = Number.NEGATIVE_INFINITY

  /** Plays a crack unless one just sounded. */
  const crackSound = (intensity: number) => {
    const now = performance.now()

    if (now - lastSoundAt < SOUND_GAP_MS) {
      return
    }

    lastSoundAt = now
    audio.crack(intensity)
  }

  const mouse = { x: -1, y: -1 }
  const grabOffset = { x: 0, y: 0 }
  let isGrabbed = false
  let isUsingControls = false
  let isCapturing = false
  let isVisible = true
  let isDirty = true
  let raf = 0
  let last = performance.now()
  let hintTimer = 0
  let isOfficeDirty = true
  let lastOfficeDraw = 0
  let cardText = ''

  // --- Selftest bookkeeping -------------------------------------------------
  const test = {
    startedAt: performance.now(),
    frames: 0,
    worstFrameMs: 0,
    slowCracks: 0,
    flickCracks: [] as number[],
    slowPeakTip: 0,
    flickPeakTip: 0,
    worstStretch: 0,
    slowAudioPeak: 0,
    flickAudioPeak: 0,
    wantsShot: false,
    isFrozen: false,
    frozenAt: 0,
    frozenFrames: 0,
    hasStarted: false,
    isDone: false,
  }

  // --- Canvas ---------------------------------------------------------------
  const resize = () => {
    const ratio = devicePixelRatio || 1
    canvas.width = Math.round(innerWidth * ratio)
    canvas.height = Math.round(innerHeight * ratio)
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    isDirty = true

    // Moved to a smaller or another screen: a whip left outside comes back.
    if (whip.gripX < 0 || whip.gripY < 0 || whip.gripX > innerWidth || whip.gripY > innerHeight) {
      const at = clampToScreen(home())
      whip.reset(at.x, at.y)
    }
  }

  // --- State from the main process -------------------------------------------
  const applyState = (next: OverlayState, isFirst = false) => {
    const wasInteractive = state.isInteractive
    state = next

    if (WHIP_PROFILES[state.whipProfile] && state.whipProfile !== profile) {
      // Another whip in the same hand: it starts where the old one was held.
      profile = state.whipProfile
      const at = clampToScreen({ x: whip.gripX, y: whip.gripY })
      whip = new Whip(at.x, at.y, WHIP_PROFILES[profile].cfg)
      detector = detectorOf(profile)
      criticalSpeed = criticalOf(profile)
      isGrabbed = false
    }

    if (!state.isTargets) targets.clear()

    office.configure(state.officeCorner, state.officeSize, state.officeTheme, state.officeLayout, state.isCalm, state.officeStyle ?? 'ilustrado')
    audio.setVolume(state.isSelftest ? 0 : state.volume)
    audio.setMuted(state.isMuted)
    muteButton.classList.toggle('is-muted', state.isMuted)
    volumeSlider.value = String(Math.round(state.volume * 100))

    if ((!state.isInteractive || !state.isWhipOn) && isGrabbed) {
      release()
    }

    // Passive by the person's own hand: the panels no longer owe it a mode.
    if (!state.isInteractive) panelMadeInteractive = false

    if (state.isInteractive !== wasInteractive) {
      note(`modo ${state.isInteractive ? 'interactivo' : 'pasivo'}`)
      isUsingControls = false
    }

    if (isFirst) {
      if (state.isWhipOn) showHint(`${state.shortcuts.interactive} para agarrar el látigo`)
    } else if (state.isInteractive !== wasInteractive) {
      showHint(state.isInteractive ? (state.isWhipOn ? 'Agarrá el mango y sacudí' : 'Pasa el mouse por un agente para ver qué hace') : 'Modo pasivo')
    }

    isDirty = true
    refreshCapture()
  }

  const showHint = (text: string) => {
    hint.textContent = text
    hint.classList.add('is-shown')
    clearTimeout(hintTimer)
    hintTimer = window.setTimeout(() => hint.classList.remove('is-shown'), HINT_SECONDS * 1000)
  }

  // --- Click-through ----------------------------------------------------------
  // The window ignores the mouse except while the pointer is over the handle
  // or the controls in interactive mode, or a drag is in progress.
  const isOver = (element: HTMLElement) => {
    if (element.hidden) {
      return false
    }

    const box = element.getBoundingClientRect()

    return (
      mouse.x >= box.left - CONTROLS_MARGIN &&
      mouse.x <= box.right + CONTROLS_MARGIN &&
      mouse.y >= box.top - CONTROLS_MARGIN &&
      mouse.y <= box.bottom + CONTROLS_MARGIN
    )
  }

  // The day's report takes clicks too, for its close button.
  const isOverControls = () => isOver(controls) || isOver(report) || isOver(player) || isOver(spendPanel)

  /** The last things that happened, for a "it got stuck" report: what changed, when. */
  const events: string[] = []

  const note = (what: string) => {
    events.push(`${new Date().toISOString().slice(11, 23)} ${what}`)
    if (events.length > 200) events.splice(0, events.length - 200)
  }

  const refreshCapture = () => {
    const isOnGrip = state.isInteractive && state.isWhipOn && isOnHandle(whip, mouse.x, mouse.y)
    const wants = state.isInteractive && (isGrabbed || isUsingControls || isOnGrip || isOverControls())
    document.body.classList.toggle('can-grab', isOnGrip && !isGrabbed)
    document.body.classList.toggle('is-grabbing', isGrabbed)

    if (wants !== isCapturing) {
      note(
        `captura ${wants ? 'ON' : 'off'} · puntero ${Math.round(mouse.x)},${Math.round(mouse.y)} · agarrado=${isGrabbed} controles=${isUsingControls} mango=${isOnGrip} panel=${isOverControls()}`,
      )
      isCapturing = wants
      overlay.setCapture(wants)
    }

    return isOnGrip
  }

  const release = () => {
    if (isGrabbed) note('suelta el látigo')
    isGrabbed = false
    // Anchored where the hand actually is, not where the mouse ran ahead to.
    whip.setTarget(whip.gripX, whip.gripY)
    overlay.save({ anchor: { x: whip.gripX, y: whip.gripY } })
    refreshCapture()
  }

  // --- Input ------------------------------------------------------------------
  window.addEventListener('mousemove', event => {
    mouse.x = event.clientX
    mouse.y = event.clientY

    // No button held: whatever press was on the controls is over, even if its release was never seen.
    if (event.buttons === 0 && isUsingControls) {
      note('controles: soltado sin evento de soltar')
      isUsingControls = false
    }

    if (isGrabbed) {
      const to = clampToScreen({ x: mouse.x - grabOffset.x, y: mouse.y - grabOffset.y })
      whip.setTarget(to.x, to.y)
    }

    refreshCapture()
  })

  document.addEventListener('mouseleave', () => {
    if (!isGrabbed && !isUsingControls) {
      mouse.x = mouse.y = -1
      refreshCapture()
    }
  })

  canvas.addEventListener('pointerdown', event => {
    mouse.x = event.clientX
    mouse.y = event.clientY

    if (event.button !== 0 || !state.isInteractive || !state.isWhipOn || !isOnHandle(whip, mouse.x, mouse.y)) {
      return
    }

    isGrabbed = true
    note('agarra el látigo')
    grabOffset.x = mouse.x - whip.gripX
    grabOffset.y = mouse.y - whip.gripY
    canvas.setPointerCapture(event.pointerId)
    audio.resume()
    refreshCapture()
  })

  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    canvas.addEventListener(type, () => {
      if (isGrabbed) {
        release()
      }
    })
  }

  controls.addEventListener('pointerdown', () => {
    isUsingControls = true
  })

  window.addEventListener('pointerup', () => {
    isUsingControls = false
    refreshCapture()
  })

  muteButton.addEventListener('click', () => {
    overlay.save({ isMuted: !state.isMuted })
  })

  volumeSlider.addEventListener('input', () => {
    const volume = Number(volumeSlider.value) / 100
    audio.setVolume(volume)
    overlay.save({ volume })
  })

  hideButton.addEventListener('click', () => overlay.hide())
  doneButton.addEventListener('click', () => overlay.setInteractive(false))

  // --- One crack: the sound and the picture from the same event -------------
  const onCrack = (crack: Crack) => {
    const tip = whip.n - 1
    const before = whip.n - 3
    const dirX = whip.x[tip] - whip.x[before]
    const dirY = whip.y[tip] - whip.y[before]
    crackSound(crack.intensity)
    fx.crack(whip.x[tip], whip.y[tip], crack.intensity, dirX, dirY)

    if (state.isSelftest) {
      const t = (last - test.startedAt) / 1000

      if (phaseAt(t) === 'flick') {
        test.wantsShot = test.flickCracks.length === 0
        test.flickCracks.push(Number(t.toFixed(3)))
      } else {
        test.slowCracks += 1
      }
    }
  }

  // --- Frame --------------------------------------------------------------------
  const place = (element: HTMLElement, x: number, y: number) => {
    const left = Math.max(4, Math.min(innerWidth - element.offsetWidth - 4, x))
    const top = Math.max(4, Math.min(innerHeight - element.offsetHeight - 4, y))
    element.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
  }

  let framesSeen = 0

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame)
    framesSeen += 1

    if (test.isFrozen) {
      // Holding the picture still while the main process photographs it.
      last = now
      test.startedAt += now - test.frozenAt
      test.frozenAt = now
      test.frozenFrames += 1

      // A few frames on, so the compositor has surely presented the picture.
      if (test.frozenFrames === 4) {
        void overlay.selftestShot('crack').finally(() => {
          test.isFrozen = false
        })
      }

      return
    }

    if (state.isSelftest && !test.hasStarted) {
      // The script's clock starts on the first frame, past the launch hitch.
      test.hasStarted = true
      test.startedAt = now
      last = now
    }

    const elapsed = (now - last) / 1000
    last = now

    if (state.isSelftest && !test.isDone) {
      selftestFrame(now, elapsed)
    }

    const wasResting = whip.isResting()
    const isOfficeOn = state.isOfficeShown && office.isShown
    const bodies = isOfficeOn && !whip.isResting() ? [...office.boxes(isGrabbed), ...office.propBoxes()] : []
    // The whip is a toy, off unless turned on: then it neither moves nor hits.
    if (state.isWhipOn) whip.advance(elapsed, h => {
      const speed = whip.tipSpeed()
      fx.pushTip(whip.x[whip.n - 1], whip.y[whip.n - 1], speed)
      const crack = detector.update(speed, h)

      if (crack) {
        onCrack(crack)
      }

      for (const hit of strikes(whip, bodies)) {
        if (hit.id.startsWith('prop:')) {
          // A cup, a pencil or a folder: knocked over, no one hurt, no sound but the crack's.
          office.hitProp(hit.id, hit.speed, hit.dir)
          continue
        }

        const isCritical = hit.isTip && hit.speed >= criticalSpeed
        const kind = office.hit(hit.id, hit.speed, hit.dir, isCritical)

        if (kind === 'dodge') {
          announce(achievements.onDodge())
        } else if (kind) {
          crackSound(isCritical ? 1 : HIT_LOUDNESS[kind])
          fx.crack(hit.x, hit.y, isCritical ? 1 : kind === 'strong' ? 0.6 : 0.2, hit.dir, 0)
          onHit(hit.id, hit.x, hit.y, isCritical)
        }
      }
    })

    // Tricks: read off the tip's path while a hand holds the whip.
    if (state.isWhipOn) {
      const tip = whip.n - 1

      if (isGrabbed) {
        const trick = tricks.add(whip.x[tip], whip.y[tip], now / 1000)

        if (trick) {
          shout = { text: TRICK_NAMES[trick], x: whip.x[tip], y: whip.y[tip] - 20, at: now }
          if (!state.isCalm) fx.crack(whip.x[tip], whip.y[tip], 0.35, 0, -1)
        }
      } else {
        tricks.reset()
      }

      // Precision: a ring above the office, touched with the tip.
      if (state.isTargets && isVisible) {
        if (!targets.target) {
          const above = office.isShown && state.isOfficeShown
          const area = above
            ? office.y > innerHeight / 2
              ? { x0: office.x, x1: office.x + office.width, y0: Math.max(EDGE, office.y - 340), y1: office.y - 20 }
              : { x0: office.x, x1: office.x + office.width, y0: office.y + office.height + 20, y1: Math.min(innerHeight - EDGE, office.y + office.height + 340) }
            : { x0: innerWidth * 0.3, x1: innerWidth * 0.7, y0: innerHeight * 0.3, y1: innerHeight * 0.7 }
          targets.spawn(area, now / 1000)
          isDirty = true
        }

        const took = targets.touch(whip.px[tip], whip.py[tip], whip.x[tip], whip.y[tip], now / 1000)

        if (took !== null) {
          shout = { text: `¡Blanco! ${took.toFixed(1).replace('.', ',')} s · racha ${targets.streak}`, x: whip.x[tip], y: whip.y[tip] - 20, at: now }
          crackSound(0.4)
          isDirty = true
        }
      }
    }

    if (isOfficeOn && state.isWhipOn) {
      // The thong's tip can hook a fallen prop, carry it and fling it.
      const tip = whip.n - 1
      office.hookTip(whip.x[tip], whip.y[tip], (whip.x[tip] - whip.px[tip]) * whip.cfg.stepHz, (whip.y[tip] - whip.py[tip]) * whip.cfg.stepHz, isGrabbed)
    }

    fx.update(Math.min(elapsed, 0.05))
    office.layout(innerWidth, innerHeight)
    const isOfficeBusy = office.step(Math.min(elapsed, 0.1), Date.now())
    drawOffice(now, isOfficeBusy || office.isEasing || !whip.isResting() || isGrabbed)

    const isOnGrip = refreshCapture()
    controls.hidden = !state.isInteractive || !state.isWhipOn || isGrabbed
    updateEmpty()
    place(controls, whip.gripX - 34, whip.gripY + 34)
    place(hint, whip.gripX - 20, whip.gripY - 60)

    // Nothing moving and nothing to pulse: leave the last frame on screen.
    const isComboShown = (comboShown !== null && now - comboShown.at < COMBO_SHOW_MS) || (shout !== null && now - shout.at < COMBO_SHOW_MS * 1.6)
    const isIdle = wasResting && whip.isResting() && !fx.isActive && (!state.isInteractive || !state.isWhipOn) && !isDirty && !isComboShown

    if (isIdle) {
      return
    }

    isDirty = false
    const glow = !state.isInteractive ? 0 : isGrabbed ? 0.25 : isOnGrip ? 0.8 : 0.4 + 0.15 * Math.sin(now / 300)
    ctx.clearRect(0, 0, innerWidth, innerHeight)
    if (state.isTargets && targets.target) {
      // The ring to touch: a gold circle with a bull's eye.
      const ring = targets.target
      ctx.save()
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(245, 197, 66, 0.9)'
      ctx.fillStyle = 'rgba(245, 197, 66, 0.18)'
      ctx.beginPath()
      ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = 'rgba(229, 72, 77, 0.9)'
      ctx.beginPath()
      ctx.arc(ring.x, ring.y, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    // In the calm mode the whip leaves no trail and throws no sparks.
    if (state.isWhipOn) {
      if (!state.isCalm) fx.drawTrail(ctx)
      drawWhip(ctx, whip, glow)
      if (!state.isCalm) fx.drawBursts(ctx)
    }

    if (shout && now - shout.at < COMBO_SHOW_MS * 1.6) {
      const age = (now - shout.at) / (COMBO_SHOW_MS * 1.6)
      ctx.save()
      ctx.globalAlpha = 1 - age
      ctx.font = '700 22px "Segoe UI", system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.lineWidth = 4
      ctx.strokeStyle = 'rgba(20, 12, 8, 0.85)'
      ctx.fillStyle = '#7CD992'
      ctx.strokeText(shout.text, shout.x, shout.y - 30 * age)
      ctx.fillText(shout.text, shout.x, shout.y - 30 * age)
      ctx.restore()
    }

    if (comboShown && now - comboShown.at < COMBO_SHOW_MS && !state.isCalm) {
      // The combo's count, rising and fading by the last hit.
      const age = (now - comboShown.at) / COMBO_SHOW_MS
      ctx.save()
      ctx.globalAlpha = 1 - age
      ctx.font = `800 ${Math.round(26 + 6 * Math.min(comboShown.text.length, 4))}px "Segoe UI", system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.lineWidth = 4
      ctx.strokeStyle = 'rgba(20, 12, 8, 0.85)'
      ctx.fillStyle = '#F5C542'
      ctx.strokeText(comboShown.text, comboShown.x, comboShown.y - 40 * age)
      ctx.fillText(comboShown.text, comboShown.x, comboShown.y - 40 * age)
      ctx.restore()
    }

    if (test.wantsShot) {
      test.wantsShot = false
      test.isFrozen = true
      test.frozenAt = now
    }
  }

  // --- The office: its own small canvas, its own pace ---------------------------
  /**
   * With nothing but typing and screens going on, the office is drawn about
   * thirty times a second; mid-reaction, or while a pose eases into place,
   * about sixty. Just under the frame times, so a 60 Hz screen draws it at
   * every frame (or every other) and a 165 Hz one at an even every third (or sixth).
   */
  const OFFICE_CALM_MS = 32
  const OFFICE_LIVELY_MS = 15

  const drawOffice = (now: number, isLively: boolean) => {
    const isShown = state.isOfficeShown && office.isShown
    officeCanvas.hidden = !isShown
    updateCard(isShown)

    if (!isShown || (!isOfficeDirty && now - lastOfficeDraw < (isLively ? OFFICE_LIVELY_MS : OFFICE_CALM_MS))) {
      return
    }

    isOfficeDirty = false
    lastOfficeDraw = now
    const ratio = devicePixelRatio || 1
    const width = Math.ceil(office.width)
    const height = Math.ceil(office.height)

    if (officeCanvas.width !== Math.round(width * ratio) || officeCanvas.height !== Math.round(height * ratio)) {
      officeCanvas.width = Math.round(width * ratio)
      officeCanvas.height = Math.round(height * ratio)
      officeCanvas.style.width = `${width}px`
      officeCanvas.style.height = `${height}px`
    }

    officeCanvas.style.transform = `translate(${Math.round(office.x)}px, ${Math.round(office.y)}px)`
    // The office draws in screen coordinates: shifted onto its own canvas.
    octx.setTransform(ratio, 0, 0, ratio, -Math.round(office.x) * ratio, -Math.round(office.y) * ratio)
    octx.clearRect(office.x - 1, office.y - 1, width + 2, height + 2)
    office.draw(octx, officeScratch, isGrabbed, Date.now())

    // The film keeps this frame, as data, if it is time for one.
    film.record(now, () => {
      const origin = office.pixelOrigin()
      const points: number[] = []
      const isNear = state.isWhipOn && whip.gripX > office.x - 300 && whip.gripX < office.x + office.width + 300 && whip.gripY > office.y - 700

      if (isNear) {
        for (let i = 0; i < whip.n; i += 2) points.push(Math.round(whip.x[i] - origin.x), Math.round(whip.y[i] - origin.y))
      }

      return office.filmFrame(Date.now(), points)
    })
  }

  /** In interactive mode the pointer reaches the window: over a character, a card with what it is doing. */
  const updateCard = (isShown: boolean) => {
    // Only in interactive mode does the pointer reach the window at all.
    if (!state.isInteractive && card.hidden) return

    const pointed = isShown && state.isInteractive && !isGrabbed ? office.actorAt(mouse.x, mouse.y) : null
    const lines = pointed ? office.tooltipOf(pointed, Date.now()) : []
    const text = lines.join('\n')

    if (text !== cardText) {
      cardText = text
      card.replaceChildren(
        ...lines.map(line => {
          const row = document.createElement('div')
          row.textContent = line

          return row
        }),
      )
    }

    card.hidden = lines.length === 0

    if (lines.length > 0) {
      place(card, mouse.x - card.offsetWidth / 2, mouse.y - card.offsetHeight - 16)
    }
  }

  /**
   * Nothing to draw: a small note in the office's corner says why (no live
   * session yet, or the mod is missing or out of date), so an empty corner
   * never looks like a broken app.
   */
  const updateEmpty = () => {
    const text =
      !isVisible || !state.isOfficeShown || office.isShown
        ? ''
        : state.setup === 'no-mod' || state.setup === 'mod-off'
          ? 'Falta el mod Oficina: bandeja → Estado y ayuda'
          : state.setup === 'old-mod'
            ? 'Actualiza el mod Oficina: bandeja → Estado y ayuda'
            : 'Abre Claude Code y lanza un agente'

    if (emptyBadge.textContent !== text) emptyBadge.textContent = text
    if (emptyBadge.dataset.corner !== state.officeCorner) emptyBadge.dataset.corner = state.officeCorner

    emptyBadge.hidden = text === ''
  }

  // --- Combos, achievements and the day's report ----------------------------------
  const announce = (unlocked: Achievement[]) => {
    const first = unlocked[0]

    if (!first) return

    const title = document.createElement('strong')
    // A recording's news is not an achievement: no "Logro" in front.
    title.textContent = first.id === 'film' ? first.title : `Logro: ${first.title}`
    const detail = document.createElement('span')
    detail.textContent = unlocked.length > 1 ? `${first.detail} (y ${unlocked.length - 1} más)` : first.detail
    toast.replaceChildren(title, detail)
    toast.classList.add('is-shown')
    clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => toast.classList.remove('is-shown'), TOAST_MS)
  }

  const onHit = (id: string, x: number, y: number, isCritical: boolean) => {
    const at = performance.now()
    combo = at - lastHitAt < COMBO_GAP_MS ? combo + 1 : 1
    lastHitAt = at

    if (combo >= 2) {
      comboShown = { text: `×${combo}`, x, y: y - 30, at }
    }

    announce(achievements.onHit({ isBoss: id.endsWith(':boss'), isCritical, combo, today: stats.today }, Date.now()))
  }

  const renderReport = () => {
    const now = Date.now()
    const totals = daylog.totals(now)
    const minutes = Math.round(totals.seconds / 60)
    reportTotals.textContent = `${totals.agents} agentes · ${totals.done} terminaron · ${totals.failed} fallaron · ${minutes} min de trabajo`

    const rows = daylog.entries().map(entry => {
      const row = document.createElement('li')
      const who = document.createElement('span')
      who.className = 'who'
      who.textContent = entry.name
      const meta = document.createElement('small')
      meta.textContent = [entry.type, entry.session].filter(Boolean).join(' · ')
      who.append(meta)
      const time = document.createElement('span')
      time.textContent = elapsedOf(
        { startedAt: entry.startedAt, endedAt: entry.endedAt || (entry.status === 'running' || entry.status === 'idle' ? 0 : entry.seenAt) } as never,
        now,
      )
      const status = document.createElement('span')
      status.className = entry.status
      status.textContent = `${STATUS_WORDS[entry.status] ?? entry.status}${entry.note ? ` (${entry.note})` : ''}`
      row.append(who, time, status)

      return row
    })

    if (rows.length === 0) {
      const empty = document.createElement('li')
      empty.textContent = 'Todavía ningún agente trabajó hoy.'
      rows.push(empty)
    }

    reportList.replaceChildren(...rows)
  }

  // --- Recording and playing back ----------------------------------------------------------
  const stamp = () => new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')

  const say = (title: string, detail: string) => announce([{ id: 'film', title, detail }])

  const record = async (kind: 'clip' | 'timelapse' | 'export-replay') => {
    const frames = kind === 'timelapse' ? film.lapseFrames : film.clipFrames

    if (frames.length < 2) {
      say('Nada para grabar todavía', 'La oficina tiene que estar a la vista un rato.')

      return
    }

    if (kind === 'export-replay') {
      const bytes = new TextEncoder().encode(JSON.stringify(toReplay(frames))).buffer as ArrayBuffer
      await overlay.saveRecording(`oficina-replay-${stamp()}.json`, bytes)

      return
    }

    if (isRendering) return

    isRendering = true
    say(kind === 'clip' ? 'Grabando el clip…' : 'Grabando el timelapse…', `Tarda ${Math.ceil(frames.length / CLIP_FPS)} segundos.`)

    try {
      const caption = (index: number) => {
        const time = new Date(frames[index]!.t)

        return kind === 'clip' ? 'Látigo · clip' : `Látigo · timelapse · ${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`
      }
      const bytes = await renderVideo(frames, CLIP_FPS, caption)
      await overlay.saveRecording(`oficina-${kind}-${stamp()}.webm`, bytes)
    } catch (error) {
      say('No se pudo grabar', String(error).slice(0, 120))
    } finally {
      isRendering = false
    }
  }

  const playScratch = document.createElement('canvas')

  const showPlayback = () => {
    if (!playback) return

    const frame = playback.frames[playback.index]!
    const { width, height } = frameSize(frame)

    if (playerCanvas.width !== width || playerCanvas.height !== height) {
      playerCanvas.width = width
      playerCanvas.height = height
    }

    drawFrame(playerCanvas.getContext('2d')!, playScratch, frame)
    playerInfo.textContent = `Replay · ${playback.index + 1}/${playback.frames.length} · ${playback.speed}×`
    playback.index = (playback.index + 1) % playback.frames.length
  }

  const setSpeed = (speed: number) => {
    if (!playback) return

    clearInterval(playback.timer)
    playback.speed = speed
    playback.timer = window.setInterval(showPlayback, 1000 / (playback.fps * speed))
  }

  /** Whether a panel turned interactive mode on by itself, and so turns it off on closing. */
  let panelMadeInteractive = false

  /**
   * A panel opened or closed. Its buttons need clicks, and in passive mode
   * clicks go through the window: so while any panel is open the app is
   * interactive, and closing the last one puts back the mode it was in.
   */
  const panelsChanged = () => {
    const isAnyOpen = !spendPanel.hidden || !report.hidden || !player.hidden

    if (isAnyOpen && !state.isInteractive) {
      panelMadeInteractive = true
      overlay.setInteractive(true)
    } else if (!isAnyOpen && panelMadeInteractive) {
      panelMadeInteractive = false

      if (state.isInteractive) overlay.setInteractive(false)
    }

    refreshCapture()
  }

  const closePlayback = () => {
    if (playback) clearInterval(playback.timer)

    playback = null
    player.hidden = true
    panelsChanged()
  }

  overlay.onReplay(data => {
    const replay = fromReplay(data)

    if (!replay) {
      say('Ese archivo no es un replay', 'Solo se abren replays exportados desde el látigo.')

      return
    }

    closePlayback()
    playback = { frames: replay.frames, fps: replay.fps, index: 0, speed: 1, timer: 0 }
    player.hidden = false
    setSpeed(1)
    showPlayback()
    panelsChanged()
  })

  document.getElementById('player-slow')!.addEventListener('click', () => setSpeed(0.5))
  document.getElementById('player-normal')!.addEventListener('click', () => setSpeed(1))
  document.getElementById('player-fast')!.addEventListener('click', () => setSpeed(2))
  document.getElementById('player-close')!.addEventListener('click', closePlayback)

  // --- Time and tokens per project and session ------------------------------------------
  let spendSessions: SpendSession[] = []
  let spendPeriod: Period = 'today'
  let spendView: 'projects' | 'clients' | 'models' | 'sessions' = 'projects'
  /** Folders that hold one folder per client: none, no "by client" view. */
  let clientFolders: string[] = []
  /** The transcripts were read at least once: an empty list then means there is nothing yet. */
  let isSpendRead = false
  /** The account's rate-limit windows, as the freshest live session last reported them. */
  let limits: Limit[] = []

  const WEEKDAYS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do']

  /** Thirty days of bars (time) and a line (new tokens), each to its own scale. */
  const drawDaily = () => {
    const canvas = document.getElementById('spend-daily') as HTMLCanvasElement
    const ctx = canvas.getContext('2d')!
    const days = dailyOf(spendSessions, Date.now())
    const width = canvas.width
    const height = canvas.height
    const bottom = height - 16
    const step = width / days.length
    const mostTime = Math.max(1, ...days.map(one => one.activeMs))
    const mostTokens = Math.max(1, ...days.map(one => one.fresh))
    ctx.clearRect(0, 0, width, height)
    ctx.font = '10px "Segoe UI", system-ui, sans-serif'
    ctx.textAlign = 'center'

    days.forEach((one, i) => {
      const bar = Math.round((bottom - 8) * (one.activeMs / mostTime))
      ctx.fillStyle = i === days.length - 1 ? '#EFA17F' : '#D97757'
      ctx.fillRect(i * step + 2, bottom - bar, step - 4, bar)

      if (i % 5 === 4 || i === days.length - 1) {
        ctx.fillStyle = '#7c828c'
        ctx.fillText(`${one.date.getDate()}/${one.date.getMonth() + 1}`, i * step + step / 2, height - 3)
      }
    })

    ctx.strokeStyle = '#6CB6FF'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    days.forEach((one, i) => {
      const y = bottom - (bottom - 8) * (one.fresh / mostTokens)
      if (i === 0) ctx.moveTo(i * step + step / 2, y)
      else ctx.lineTo(i * step + step / 2, y)
    })
    ctx.stroke()
    ctx.fillStyle = '#9aa0aa'
    ctx.textAlign = 'left'
    ctx.fillText(`máx ${shortTime(mostTime)} · ${shortTokens(mostTokens)} tokens`, 4, 10)
  }

  /** Weekdays by hours, warmer where more time went. */
  const drawHours = () => {
    const canvas = document.getElementById('spend-hours') as HTMLCanvasElement
    const ctx = canvas.getContext('2d')!
    const grid = hoursOf(spendSessions, spendPeriod, Date.now())
    const most = Math.max(1, ...grid.flat())
    const left = 20
    const top = 2
    const cell = Math.min((canvas.width - left) / 24, (canvas.height - top - 14) / 7)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.font = '9px "Segoe UI", system-ui, sans-serif'

    grid.forEach((row, day) => {
      ctx.fillStyle = '#7c828c'
      ctx.textAlign = 'left'
      ctx.fillText(WEEKDAYS[day]!, 0, top + day * cell + cell * 0.75)

      row.forEach((ms, hour) => {
        const heat = ms / most
        ctx.fillStyle = ms === 0 ? 'rgba(255, 255, 255, 0.05)' : `rgba(217, 119, 87, ${0.2 + 0.8 * heat})`
        ctx.fillRect(left + hour * cell + 0.5, top + day * cell + 0.5, cell - 1, cell - 1)
      })
    })

    ctx.fillStyle = '#7c828c'
    ctx.textAlign = 'center'

    for (const hour of [0, 6, 12, 18]) ctx.fillText(String(hour), left + hour * cell + cell / 2, top + 7 * cell + 10)
  }

  const money = (usd: number) => (usd > 0 ? `US$ ${usd.toFixed(2).replace('.', ',')}` : '—')

  const button = (label: string, isOn: boolean, onClick: () => void) => {
    const one = document.createElement('button')
    one.type = 'button'
    one.textContent = label
    one.classList.toggle('is-on', isOn)
    one.addEventListener('click', onClick)

    return one
  }

  const cell = (text: string, small = '') => {
    const td = document.createElement('td')
    td.textContent = text

    if (small) {
      const note = document.createElement('small')
      note.textContent = small
      td.append(note)
    }

    return td
  }

  const renderSpend = () => {
    if (spendView === 'clients' && clientFolders.length === 0) spendView = 'projects'
    const spend = spendOf(spendSessions, spendPeriod, Date.now(), clientFolders)
    document.getElementById('spend-periods')!.replaceChildren(
      ...PERIODS.map(one => button(one.label, one.value === spendPeriod, () => ((spendPeriod = one.value), renderSpend()))),
    )
    document.getElementById('spend-views')!.replaceChildren(
      button('Por proyecto', spendView === 'projects', () => ((spendView = 'projects'), renderSpend())),
      ...(clientFolders.length > 0 ? [button('Por cliente', spendView === 'clients', () => ((spendView = 'clients'), renderSpend()))] : []),
      button('Por modelo', spendView === 'models', () => ((spendView = 'models'), renderSpend())),
      button('Por sesión', spendView === 'sessions', () => ((spendView = 'sessions'), renderSpend())),
    )
    document.getElementById('spend-limits')!.textContent = limits.map(limitLine).join(' · ')
    drawDaily()
    drawHours()
    const total = spend.total
    document.getElementById('spend-total')!.textContent =
      spendSessions.length === 0
        ? isSpendRead
          ? 'Todavía no hay datos de gasto: aparecen cuando trabajes con Claude Code.'
          : 'Leyendo las sesiones de Claude Code… (la primera vez tarda unos segundos)'
        : `${total.sessions} sesiones · ${shortTime(total.activeMs)} activas · ${shortTokens(freshOf(total))} tokens nuevos (${shortTokens(total.output)} de salida) y ${shortTokens(total.cacheRead)} leídos de caché · ${total.replies} respuestas${total.usd > 0 ? ` · ${money(total.usd)} informados` : ''}`
    document.getElementById('spend-name')!.textContent = { projects: 'Proyecto', clients: 'Cliente', models: 'Modelo', sessions: 'Sesión' }[spendView]
    const rows = { projects: spend.projects, clients: spend.clients, models: spend.models, sessions: spend.sessions }[spendView].slice(0, 200)
    document.getElementById('spend-rows')!.replaceChildren(
      ...rows.map(row => {
        const tr = document.createElement('tr')
        const when = new Date(row.lastAt).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
        tr.append(
          cell(row.name, spendView === 'sessions' ? `${row.detail} · ${when}` : row.detail),
          cell(String(row.sessions)),
          // Time belongs to sessions, not to the model that answered: left out per model.
          cell(spendView === 'models' ? '—' : shortTime(row.activeMs)),
          cell(shortTokens(row.input + row.cacheWrite)),
          cell(shortTokens(row.output)),
          cell(shortTokens(row.cacheRead)),
          cell(money(row.usd)),
        )

        return tr
      }),
    )
  }

  /** The week a date falls in, as `YYYY-Wnn`: what the summary is kept once per. */
  const weekOf = (date: Date) => {
    const thursday = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 3 - ((date.getDay() + 6) % 7))
    const first = new Date(thursday.getFullYear(), 0, 4)

    return `${thursday.getFullYear()}-W${String(1 + Math.round((thursday.getTime() - first.getTime()) / 604_800_000)).padStart(2, '0')}`
  }

  const weeklySummary = () => {
    const now = new Date()

    if (now.getDay() !== 5 || now.getHours() < 17 || spendSessions.length === 0) return

    const week = weekOf(now)

    try {
      if (window.localStorage.getItem('oficina.weekly') === week) return

      window.localStorage.setItem('oficina.weekly', week)
    } catch {
      return
    }

    const spend = spendOf(spendSessions, 'week', now.getTime(), clientFolders)
    const top = spend.projects
      .slice(0, 3)
      .map(row => `${row.name} ${shortTime(row.activeMs)}`)
      .join(' · ')
    overlay.notify(
      `Tu semana con Claude: ${shortTime(spend.total.activeMs)}, ${shortTokens(freshOf(spend.total))} tokens`,
      `${spend.total.sessions} sesiones. ${top}`,
    )
  }

  window.setInterval(weeklySummary, 10 * 60_000)

  overlay.onSpend(spend => {
    spendSessions = spend.sessions
    clientFolders = spend.clientFolders
    isSpendRead = true
    office.setSpend(spend.sessions)
    weeklySummary()

    if (!spendPanel.hidden) renderSpend()
  })

  document.getElementById('spend-close')!.addEventListener('click', () => {
    spendPanel.hidden = true
    panelsChanged()
  })

  reportClose.addEventListener('click', () => {
    report.hidden = true
    panelsChanged()
  })

  const selftestFrame = (now: number, elapsed: number) => {
    const t = (now - test.startedAt) / 1000
    const phase = phaseAt(t)
    const hand = handAt(t, anchor)
    whip.setTarget(hand.x, hand.y)
    test.frames += 1
    test.worstFrameMs = Math.max(test.worstFrameMs, elapsed * 1000)
    test.worstStretch = Math.max(test.worstStretch, whip.stretch())

    if (phase === 'slow') {
      test.slowPeakTip = Math.max(test.slowPeakTip, whip.tipSpeed())
      test.slowAudioPeak = Math.max(test.slowAudioPeak, audio.peak())
    } else if (phase === 'flick') {
      test.flickPeakTip = Math.max(test.flickPeakTip, whip.tipSpeed())
      test.flickAudioPeak = Math.max(test.flickAudioPeak, audio.peak())
    } else if (phase === 'done') {
      test.isDone = true
      const seconds = (now - test.startedAt) / 1000
      overlay.selftestDone({
        seconds: Number(seconds.toFixed(2)),
        frames: test.frames,
        averageFps: Math.round(test.frames / seconds),
        worstFrameMs: Math.round(test.worstFrameMs),
        devicePixelRatio,
        canvas: { width: canvas.width, height: canvas.height },
        slowCracks: test.slowCracks,
        slowPeakTip: Math.round(test.slowPeakTip),
        flicks: FLICKS,
        flickCracks: test.flickCracks,
        flickPeakTip: Math.round(test.flickPeakTip),
        worstStretch: Number(test.worstStretch.toFixed(3)),
        finalStretch: Number(whip.stretch().toFixed(3)),
        audioState: audio.state,
        crackRecordings: audio.recordings,
        slowAudioPeak: Number(test.slowAudioPeak.toFixed(4)),
        flickAudioPeak: Number(test.flickAudioPeak.toFixed(4)),
      })
    }
  }

  // --- Lifecycle ----------------------------------------------------------------
  const setVisible = (next: boolean) => {
    if (next === isVisible) {
      return
    }

    isVisible = next

    // Hidden or shown, nobody is mid-press on the controls any more.
    isUsingControls = false
    note(`visible=${isVisible}`)

    if (isVisible) {
      last = performance.now()
      isDirty = true
      isOfficeDirty = true
      // The main process starts the window back without holding the mouse:
      // what this side believes is set again from there.
      isCapturing = false
      mouse.x = mouse.y = -1
      refreshCapture()
      audio.resume()
      raf = requestAnimationFrame(frame)
    } else {
      // Hidden: nothing on screen, no frames, no audio graph running. The
      // window stays up (see the main process), only empty.
      cancelAnimationFrame(raf)
      audio.suspend()
      ctx.clearRect(0, 0, innerWidth, innerHeight)
      officeCanvas.hidden = true
      card.hidden = true
      controls.hidden = true
      hint.classList.remove('is-shown')
    }
  }

  overlay.onState(next => applyState(next))
  overlay.onPointer(point => {
    // Not mid-drag: there the window's own events are the truth.
    if (isGrabbed || isUsingControls) return

    mouse.x = point.x
    mouse.y = point.y
    refreshCapture()
  })
  overlay.onAgents(sessions => {
    office.setSessions(sessions)
    isOfficeDirty = true

    // What the office draws, as text: one line per boss and agent.
    rosterList.replaceChildren(
      ...sessions.flatMap(session => [
        ...(session.boss ? [`${session.label || 'Claude Code'} · Claude · ${session.boss.status}`] : []),
        ...session.agents.map(agent => `${session.label || 'Claude Code'} · ${agent.name || agent.type} · ${STATUS_WORDS[agent.status] ?? agent.status}`),
      ]).map(line => {
        const item = document.createElement('li')
        item.textContent = line

        return item
      }),
    )

    // The account's limits, as every live session last heard them: one that has
    // been quiet a while still tells an old figure, so the latest window counts
    // and, within it, the highest use (it only grows until the window resets).
    const reported = mergeLimits(sessions.flatMap(session => (session.usage as { limits?: Limit[] } | null | undefined)?.limits ?? []))

    if (JSON.stringify(reported) !== JSON.stringify(limits)) {
      limits = reported
      office.setLimits(limits)
      overlay.limits(limits)

      if (!spendPanel.hidden) renderSpend()
    }

    // Someone new waiting on the person: one crack, if asked for.
    const waiting = office.waitingKeys()
    const isNew = [...waiting].some(key => !waitingBefore.has(key))
    waitingBefore = waiting

    if (isNew && state.isAlertSound && isVisible) {
      crackSound(ALERT_LOUDNESS)
    }

    if (daylog.update(office.roster()) && !report.hidden) {
      renderReport()
    }
  })
  overlay.onCommand(command => {
    if (command.type === 'visible') {
      setVisible(command.isVisible)
    } else if (command.type === 'clip' || command.type === 'timelapse' || command.type === 'export-replay') {
      void record(command.type)
    } else if (command.type === 'diag') {
      // Everything this side knows, for the main process to save with its own.
      overlay.diagnostics({
        visible: isVisible,
        interactive: state.isInteractive,
        capturing: isCapturing,
        grabbed: isGrabbed,
        usingControls: isUsingControls,
        mouse: { x: Math.round(mouse.x), y: Math.round(mouse.y) },
        grip: { x: Math.round(whip.gripX), y: Math.round(whip.gripY) },
        panels: { spend: !spendPanel.hidden, report: !report.hidden, player: !player.hidden },
        whipProfile: profile,
        frames: framesSeen,
        lastFrameAgoMs: Math.round(performance.now() - last),
        screen: { width: innerWidth, height: innerHeight, ratio: devicePixelRatio },
        events: [...events],
      })
    } else if (command.type === 'spend') {
      spendPanel.hidden = !spendPanel.hidden

      if (!spendPanel.hidden) renderSpend()

      panelsChanged()
    } else if (command.type === 'report') {
      report.hidden = !report.hidden

      if (!report.hidden) renderReport()

      panelsChanged()
    } else {
      const at = clampToScreen(home())
      whip.reset(at.x, at.y)
      overlay.save({ anchor: at })
      isDirty = true
    }
  })

  window.addEventListener('resize', resize)
  resize()
  applyState(state, true)
  raf = requestAnimationFrame(frame)
}

// Anything that goes wrong in the page is written down by the main process,
// so a failure at startup is not lost before anyone could look.
window.addEventListener('error', event => window.overlay.reportError(`${event.message} @ ${event.filename}:${event.lineno}`))
window.addEventListener('unhandledrejection', event => window.overlay.reportError(String((event.reason as Error)?.stack ?? event.reason)))

start().catch(error => window.overlay.reportError(`start: ${String((error as Error)?.stack ?? error)}`))
