// Updates from GitHub Releases: the app's only network call, and it can be
// turned off. The installed version downloads a new one by itself and
// installs it on quit (or at once, from the tray); the portable one cannot
// replace itself, so it only says a new one is out. No code signing: the
// updater checks the download against the release's own checksum.

import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import * as path from 'node:path'

export type UpdateState = { kind: 'idle' | 'checking' | 'available' | 'ready' | 'none' | 'error'; version: string }

type Hooks = {
  /** Every change of state, for the tray. */
  onState: (state: UpdateState) => void
  /** A one-line Windows notification. */
  notify: (key: 'available' | 'portable' | 'ready' | 'none' | 'error', version: string) => void
}

/**
 * A local feed for the update test, never honoured otherwise: only under
 * test (OFICINA_E2E), only on this machine (loopback), and in a packaged
 * app only when the build itself was marked as a test build by CI
 * (`-c.extraMetadata.oficinaTestBuild=true`). A release build ignores it.
 */
export const testFeedOf = (env: Record<string, string | undefined>, isPackaged: boolean, isTestBuild: boolean) => {
  const feed = env.OFICINA_UPDATE_URL

  if (!feed || env.OFICINA_E2E !== '1' || (isPackaged && !isTestBuild)) return null

  try {
    const url = new URL(feed)

    return url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost') ? feed : null
  } catch {
    return null
  }
}

/** Whether CI marked this build as a test build (its package.json says so). */
const isTestBuild = () => {
  try {
    return (require(path.join(app.getAppPath(), 'package.json')) as { oficinaTestBuild?: unknown }).oficinaTestBuild === true
  } catch {
    return false
  }
}

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000
const FIRST_CHECK_MS = 30_000

/** The portable .exe runs unpacked from a temp folder: it cannot update itself. */
export const isPortable = () => Boolean(process.env.PORTABLE_EXECUTABLE_FILE)

let state: UpdateState = { kind: 'idle', version: '' }
let hooks: Hooks | null = null
let timer: ReturnType<typeof setInterval> | null = null
let firstCheck: ReturnType<typeof setTimeout> | null = null
/** A check the person asked for answers even "you are up to date". */
let isAsked = false
/** The test feed in use, if any. */
let feed: string | null = null
/** The periodic check is on: with it off, only a check the person asks for runs. */
let isEnabled = false
/** Versions already announced, so a later check does not say the same news again. */
const announced = new Set<string>()

const set = (next: UpdateState) => {
  state = next
  hooks?.onState(state)
}

export const updateState = () => state

export const setupUpdates = (given: Hooks) => {
  hooks = given
  autoUpdater.autoDownload = !isPortable()
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false
  autoUpdater.logger = null

  // Tests point the updater at a local feed instead of GitHub.
  feed = testFeedOf(process.env, app.isPackaged, isTestBuild())

  if (feed) {
    autoUpdater.setFeedURL({ provider: 'generic', url: feed })
    autoUpdater.forceDevUpdateConfig = !app.isPackaged
  }

  // A downloaded version stays ready until it is installed: no later check takes the tray's "restart" away.
  const isReady = () => state.kind === 'ready'

  autoUpdater.on('checking-for-update', () => {
    if (!isReady()) set({ kind: 'checking', version: '' })
  })
  autoUpdater.on('update-available', info => {
    isAsked = false
    if (isReady()) return

    set({ kind: 'available', version: info.version })

    if (!announced.has(`available:${info.version}`)) {
      announced.add(`available:${info.version}`)
      hooks?.notify(isPortable() ? 'portable' : 'available', info.version)
    }
  })
  autoUpdater.on('update-not-available', info => {
    if (!isReady()) set({ kind: 'none', version: info.version })
    if (isAsked) hooks?.notify('none', app.getVersion())
    isAsked = false
  })
  autoUpdater.on('update-downloaded', info => {
    set({ kind: 'ready', version: info.version })

    if (!announced.has(`ready:${info.version}`)) {
      announced.add(`ready:${info.version}`)
      hooks?.notify('ready', info.version)
    }
  })
  autoUpdater.on('error', () => {
    if (!isReady()) set({ kind: 'error', version: '' })
    if (isAsked) hooks?.notify('error', '')
    isAsked = false
  })
}

/** Checks now. `isAskedFor`: the person asked, so the answer is said even when there is nothing new. */
export const checkNow = (isAskedFor = false) => {
  // Run from the source code there is nothing to replace, unless a test feed says otherwise.
  if (!app.isPackaged && !feed) return
  // Turned off: nothing reaches GitHub unless the person asks.
  if (!isEnabled && !isAskedFor) return

  isAsked = isAskedFor
  autoUpdater.checkForUpdates().catch(() => set({ kind: 'error', version: '' }))
}

/** Turns the periodic check on or off. */
export const scheduleUpdates = (isOn: boolean) => {
  if (timer) clearInterval(timer)
  if (firstCheck) clearTimeout(firstCheck)
  timer = null
  firstCheck = null
  isEnabled = isOn

  if (!isOn) return

  firstCheck = setTimeout(() => checkNow(), FIRST_CHECK_MS)
  timer = setInterval(() => checkNow(), CHECK_EVERY_MS)
}

/** Quits and installs the downloaded version. */
export const installNow = () => {
  if (state.kind === 'ready') autoUpdater.quitAndInstall(true, true)
}
