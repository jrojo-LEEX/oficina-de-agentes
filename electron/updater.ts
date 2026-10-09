// Updates from GitHub Releases: the app's only network call, and it can be
// turned off. The installed version downloads a new one by itself and
// installs it on quit (or at once, from the tray); the portable one cannot
// replace itself, so it only says a new one is out. No code signing: the
// updater checks the download against the release's own checksum.

import { app } from 'electron'
import { autoUpdater } from 'electron-updater'

export type UpdateState = { kind: 'idle' | 'checking' | 'available' | 'ready' | 'none' | 'error'; version: string }

type Hooks = {
  /** Every change of state, for the tray. */
  onState: (state: UpdateState) => void
  /** A one-line Windows notification. */
  notify: (key: 'available' | 'portable' | 'ready' | 'none' | 'error', version: string) => void
}

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000
const FIRST_CHECK_MS = 30_000

/** The portable .exe runs unpacked from a temp folder: it cannot update itself. */
export const isPortable = () => Boolean(process.env.PORTABLE_EXECUTABLE_FILE)

let state: UpdateState = { kind: 'idle', version: '' }
let hooks: Hooks | null = null
let timer: ReturnType<typeof setInterval> | null = null
/** A check the person asked for answers even "you are up to date". */
let isAsked = false

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
  const feed = process.env.OFICINA_UPDATE_URL

  if (feed) {
    autoUpdater.setFeedURL({ provider: 'generic', url: feed })
    autoUpdater.forceDevUpdateConfig = !app.isPackaged
  }

  autoUpdater.on('checking-for-update', () => set({ kind: 'checking', version: '' }))
  autoUpdater.on('update-available', info => {
    set({ kind: 'available', version: info.version })
    hooks?.notify(isPortable() ? 'portable' : 'available', info.version)
  })
  autoUpdater.on('update-not-available', info => {
    set({ kind: 'none', version: info.version })
    if (isAsked) hooks?.notify('none', app.getVersion())
    isAsked = false
  })
  autoUpdater.on('update-downloaded', info => {
    set({ kind: 'ready', version: info.version })
    hooks?.notify('ready', info.version)
  })
  autoUpdater.on('error', () => {
    set({ kind: 'error', version: '' })
    if (isAsked) hooks?.notify('error', '')
    isAsked = false
  })
}

/** Checks now. `isAskedFor`: the person asked, so the answer is said even when there is nothing new. */
export const checkNow = (isAskedFor = false) => {
  // Run from the source code there is nothing to replace, unless a test feed says otherwise.
  if (!app.isPackaged && !process.env.OFICINA_UPDATE_URL) return

  isAsked = isAskedFor
  autoUpdater.checkForUpdates().catch(() => set({ kind: 'error', version: '' }))
}

/** Turns the periodic check on or off. */
export const scheduleUpdates = (isOn: boolean) => {
  if (timer) clearInterval(timer)
  timer = null

  if (!isOn) return

  setTimeout(() => checkNow(), FIRST_CHECK_MS)
  timer = setInterval(() => checkNow(), CHECK_EVERY_MS)
}

/** Quits and installs the downloaded version. */
export const installNow = () => {
  if (state.kind === 'ready') autoUpdater.quitAndInstall(true, true)
}
