// The app's main process: one transparent always-on-top window over a
// display where the office lives, the click-through switch, global
// shortcuts, the tray, the first-run guide, notifications and updates.

import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  protocol,
  screen,
  session,
  shell,
  Tray,
} from 'electron'
import type { IpcMainEvent, IpcMainInvokeEvent, MenuItemConstructorOptions } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { changesOf } from './changes'
import type { Seen } from './changes'
import { carryOver, DEFAULTS, FIELDS, loadConfigFile, saveConfig } from './config'
import type { Config } from './config'
import { currentLanguage, languageOf, localeOf, setLanguage, t } from './i18n'
import { readLive } from './live'
import { loadLedger, saveLedger, scan, summaryOf } from './ledger'
import { claudeDirOf, ENV, isInside, LEGACY_USER_DATA_NAME, liveDirOf, transcriptsDirOf, userDataDirOf } from './paths'
import { MOD_COMMANDS, RELEASES_URL, REPO_URL } from './repo'
import { sceneAt, SCENES } from './scenes'
import type { SceneKind } from './scenes'
import { setupStatus } from './setup'
import type { SetupStatus } from './setup'
import type { LiveSession, OverlayCommand, OverlayState, SavePatch, SetupBadge, SetupPatch, SetupView } from './shared'
import { checkNow, installNow, isPortable, scheduleUpdates, setupUpdates, updateState } from './updater'

const CORNERS = ['br', 'bl', 'tr', 'tl'] as const
const SIZES = ['s', 'm', 'l'] as const
const STYLES = ['ilustrado', 'pixel'] as const
const LAYOUTS = ['horizontal', 'tower', 'wings'] as const
const THEMES = ['auto', 'normal', 'night', 'party'] as const
const PROFILES = ['classic', 'short', 'long', 'flexible'] as const
const LANGUAGES = ['auto', 'es', 'en'] as const

const IS_SELFTEST = process.argv.includes('--selftest')
/** End-to-end tests: notifications are recorded instead of shown, nothing touches Windows' startup or updates. */
const IS_E2E = process.env.OFICINA_E2E === '1'
const SELFTEST_DIR = path.join(process.cwd(), 'selftest-out')
const VOLUME_STEPS = [0.25, 0.5, 0.75, 1]
const LIVE_POLL_MS = 700
/** How often the guide's checks (Claude Code's folder, the mod) are run again for the corner's badge. */
const SETUP_POLL_MS = 15_000
/** Windows names the app's notifications by this. */
const APP_ID = 'io.github.oficina-de-agentes'

// The app's own folder (config, ledger, logs) is set before anything reads it.
const legacyDir = path.join(app.getPath('appData'), LEGACY_USER_DATA_NAME)
app.setPath('userData', userDataDirOf(app.getPath('appData')))

/** Claude Code's folder, the mod's snapshots and the transcripts: read once, from the environment. */
const CLAUDE_DIR = claudeDirOf()
const LIVE_DIR = liveDirOf()
const TRANSCRIPTS_DIR = transcriptsDirOf()

let win: BrowserWindow | null = null
let setupWin: BrowserWindow | null = null
let tray: Tray | null = null
let config: Config = structuredClone(DEFAULTS)
let isInteractive = false
let isCapturing = false
let isVisible = true
/** Whether it was interactive when it was hidden: showing it again puts that back. */
let wasInteractive = false
/** Shortcuts the system refused, usually because another app holds them. */
let failedShortcuts: string[] = []
const shots: Record<string, unknown> = {}
let lastLive = ''
/** Limit windows already warned about, by kind and reset time. */
const warnedLimits = new Set<string>()
/** The demo scene playing, if any, and since when. Never saved: a restart turns it off. */
let scene: { kind: SceneKind; since: number } | null = null
/** The guide's last findings. */
let setup: SetupStatus | null = null

/** What end-to-end tests read back (every notification, in order) and can do (send the page a command). */
const e2e = {
  notes: [] as { title: string; body: string }[],
  command: (type: OverlayCommand['type']) => {
    if (IS_E2E && type !== 'visible') send('command', { type } as OverlayCommand)
  },
  setup: () => {
    if (IS_E2E) openSetup()
  },
  /** Interactive or passive, as the shortcut would: a test can't count on getting the real one. */
  interactive: (isOn: boolean) => {
    if (IS_E2E) setInteractive(isOn)
  },
  /** Checks for an update now (the test points the updater at a local feed). */
  checkUpdates: () => {
    if (IS_E2E) checkNow(true)
  },
  updateState: () => updateState(),
  /** Plays a demo scene (for the README's recording). */
  scene: (kind: SceneKind) => {
    if (IS_E2E) playScene(kind)
  },
  installUpdate: () => {
    if (IS_E2E) installNow()
  },
}
if (IS_E2E) (globalThis as { __oficinaE2E?: typeof e2e }).__oficinaE2E = e2e

// --- Config -------------------------------------------------------------------

const configPath = () => path.join(app.getPath('userData'), 'config.json')

const persist = () => {
  if (IS_SELFTEST) return

  try {
    saveConfig(configPath(), config)
  } catch (error) {
    console.error('Could not save the config:', error)
  }
}

const applyLanguage = () => setLanguage(languageOf(config.language, app.getPreferredSystemLanguages()))

// --- Notifications ----------------------------------------------------------------

/** Shows a Windows notification (or, under test, records it). Clicking it runs `onClick`. */
const showNote = (title: string, body: string, onClick?: () => void) => {
  const note = { title: title.slice(0, 200), body: body.slice(0, 400) }

  if (IS_E2E) {
    e2e.notes.push(note)
    return
  }

  if (!Notification.isSupported()) return

  const shown = new Notification({ ...note, silent: true })
  if (onClick) shown.on('click', onClick)
  shown.show()
}

// --- Window ---------------------------------------------------------------------

const badgeOf = (status: SetupStatus | null): SetupBadge => {
  if (!status) return 'ok'
  if (!status.hasClaude) return 'no-claude'
  if (status.isModDisabled) return 'mod-off'
  if (!status.modSource) return 'no-mod'
  if (status.isModOld) return 'old-mod'

  return 'ok'
}

const stateForRenderer = (): OverlayState => ({
  isInteractive,
  isWhipOn: config.isWhipOn,
  language: currentLanguage(),
  setup: badgeOf(setup),
  isOfficeShown: config.isOfficeShown,
  officeCorner: config.officeCorner,
  officeSize: config.officeSize,
  officeTheme: config.officeTheme,
  officeLayout: config.officeLayout,
  officeStyle: config.officeStyle,
  isCalm: config.isCalm,
  whipProfile: config.whipProfile,
  isTargets: config.isWhipOn && config.isTargets,
  isAlertSound: config.isAlertSound,
  isMuted: config.isMuted,
  volume: config.volume,
  anchor: config.anchor,
  shortcuts: config.shortcuts,
  isSelftest: IS_SELFTEST,
})

const send = (channel: 'state' | 'command' | 'agents' | 'replay' | 'spend', payload: OverlayState | OverlayCommand | LiveSession[] | unknown) => {
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload)
  }
}

/**
 * Where the pointer is, asked of the system rather than waited for: Windows
 * stops forwarding mouse moves to a click-through window after some things
 * (its tray menu, a hide and show), and then nothing in the window could be
 * pointed at. While interactive and not yet holding the mouse, the position
 * is read here and handed to the renderer, which decides what is under it.
 */
let lastPointer = ''

const pollPointer = () => {
  if (!win || win.isDestroyed() || !isVisible || !isInteractive || isCapturing) {
    lastPointer = ''

    return
  }

  const point = screen.getCursorScreenPoint()
  const bounds = win.getBounds()
  const x = point.x - bounds.x
  const y = point.y - bounds.y
  const key = `${x},${y}`

  if (key !== lastPointer) {
    lastPointer = key
    win.webContents.send('pointer', { x, y })
  }
}

/** Sets the click-through up again from scratch: after the tray menu, Windows may have dropped it. */
const resetMouse = () => {
  if (!win || win.isDestroyed()) return

  isCapturing = false
  win.setIgnoreMouseEvents(false)
  applyMouse()
}

/**
 * The one place the click-through switch is thrown. The window swallows the
 * mouse only in interactive mode while the renderer says the pointer is on
 * something of its own (the whip's handle, a panel); everywhere else, and
 * always in passive mode, clicks go to whatever is underneath. `forward`
 * keeps mouse moves arriving in interactive mode so the renderer can tell.
 */
const applyMouse = () => {
  if (!win || win.isDestroyed()) {
    return
  }

  noteMain(`mouse: ${isVisible && isInteractive && isCapturing ? 'captures clicks' : `passes through (follow=${isVisible && isInteractive})`} · visible=${isVisible} interactive=${isInteractive} capture=${isCapturing}`)

  if (isVisible && isInteractive && isCapturing) {
    win.setIgnoreMouseEvents(false)
  } else {
    win.setIgnoreMouseEvents(true, { forward: isVisible && isInteractive })
  }
}

const setInteractive = (next: boolean) => {
  isInteractive = next
  isCapturing = false

  if (next && !isVisible) {
    setVisible(true, 'interactive mode')
  }

  applyMouse()
  send('state', stateForRenderer())
  refreshTray()
}

const setVisible = (next: boolean, why = '') => {
  isVisible = next
  // Who asked, for the diagnostics: "it vanished" is answered by this line.
  noteMain(`${next ? 'show' : 'hide'} (${why || 'no reason'})`)

  if (!win || win.isDestroyed()) {
    return
  }

  // The window itself is never hidden: Windows stops forwarding the mouse
  // to a window that was, and nothing could be pointed at again. Hidden
  // only means the renderer draws nothing and every click passes through.
  if (!win.isVisible()) {
    win.showInactive()
  }

  win.setAlwaysOnTop(true, 'screen-saver')

  if (next) {
    // Back as it was hidden: interactive stays interactive.
    isInteractive = isInteractive || wasInteractive
    wasInteractive = false
  } else {
    // Hidden is passive: nothing invisible can hold clicks.
    wasInteractive = isInteractive
    isInteractive = false
  }

  isCapturing = false
  applyMouse()
  send('state', stateForRenderer())

  send('command', { type: 'visible', isVisible: next })
  refreshTray()
}

/** The chosen display while it is connected, else the primary one. */
const targetDisplay = () =>
  screen.getAllDisplays().find(display => display.id === config.displayId) ?? screen.getPrimaryDisplay()

const fitToDisplay = () => {
  if (win && !win.isDestroyed()) {
    win.setBounds(targetDisplay().workArea)
  }

  refreshTray()
}

const moveToDisplay = (id: number) => {
  config.displayId = id
  persist()
  fitToDisplay()
  send('command', { type: 'recenter' })
}

/**
 * The pages are served from the app's own scheme, `app://oficina/`, out of
 * the built `dist` folder and nothing else: a standard, secure origin, so
 * the pages' CSP 'self' means exactly these files, and file:// needs no
 * extra privileges (that fuse is off).
 */
const SCHEME = 'app'
const HOST = 'oficina'
const DIST = path.join(__dirname, '..', 'dist')
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
}

protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }])

const servePages = () =>
  protocol.handle(SCHEME, request => {
    const url = new URL(request.url)
    const file = path.join(DIST, decodeURIComponent(url.pathname))
    const type = TYPES[path.extname(file).toLowerCase()]

    if (url.host !== HOST || !type || !isInside(DIST, file)) return new Response('Not found', { status: 404 })

    try {
      return new Response(fs.readFileSync(file), { headers: { 'content-type': type, 'x-content-type-options': 'nosniff' } })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })

/** The page's own files: the only thing the windows may load. */
const pageUrl = (name: string) => `${SCHEME}://${HOST}/${name}`

const createWindow = () => {
  const area = targetDisplay().workArea

  win = new BrowserWindow({
    ...area,
    title: t('app.name'),
    show: false,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    // Never takes the keyboard: the terminal keeps the focus even mid-drag.
    focusable: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      backgroundThrottling: false,
    },
  })

  win.setAlwaysOnTop(true, 'screen-saver')
  applyMouse()
  void win.loadURL(pageUrl('index.html'))

  win.once('ready-to-show', () => {
    win?.showInactive()
  })

  // A renderer that dies or hangs must not leave a window holding the mouse.
  const failSafe = () => {
    isInteractive = false
    isCapturing = false
    applyMouse()
    refreshTray()
  }
  win.webContents.on('render-process-gone', failSafe)
  win.on('unresponsive', failSafe)

  win.on('closed', () => {
    win = null
  })
}

// --- The first-run guide ----------------------------------------------------------

const setupView = (): SetupView => {
  const status = setup ?? setupStatus(CLAUDE_DIR, LIVE_DIR, Date.now())
  const mod: SetupView['mod'] = status.isModDisabled
    ? 'off'
    : status.isModOld
      ? 'old'
      : status.modSource === 'marketplace'
        ? 'ok'
        : status.modSource === 'folder'
          ? 'folder'
          : status.modSource === 'seen'
            ? 'seen'
            : 'missing'

  return {
    claudeDir: status.claudeDir,
    isCustomDir: Boolean(process.env.CLAUDE_CONFIG_DIR?.trim()),
    hasClaude: status.hasClaude,
    mod,
    modVersion: status.modVersion,
    liveSessions: status.liveSessions,
    commands: mod === 'missing' ? MOD_COMMANDS.install : mod === 'old' ? MOD_COMMANDS.update : mod === 'off' ? MOD_COMMANDS.enable : [],
    appVersion: app.getVersion(),
    language: currentLanguage(),
    options: { isOpenAtLogin: config.isOpenAtLogin, isUpdateCheck: config.isUpdateCheck, isWhipOn: config.isWhipOn, language: config.language },
    shortcuts: config.shortcuts,
  }
}

const refreshSetup = () => {
  const before = badgeOf(setup)
  setup = setupStatus(CLAUDE_DIR, LIVE_DIR, Date.now())

  if (badgeOf(setup) !== before) send('state', stateForRenderer())
}

const openSetup = () => {
  if (setupWin && !setupWin.isDestroyed()) {
    setupWin.show()
    setupWin.focus()

    return
  }

  setupWin = new BrowserWindow({
    width: 620,
    height: 720,
    minWidth: 480,
    minHeight: 520,
    title: t('app.name'),
    icon: trayIcon(),
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#1F1A17',
    webPreferences: {
      preload: path.join(__dirname, 'setup-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  })
  setupWin.removeMenu()
  void setupWin.loadURL(pageUrl('setup.html'))
  // Under test it opens without taking the keyboard from whoever is typing.
  setupWin.once('ready-to-show', () => (IS_E2E ? setupWin?.showInactive() : setupWin?.show()))
  setupWin.on('closed', () => {
    setupWin = null

    if (!config.isOnboarded) {
      config.isOnboarded = true
      persist()
    }
  })
}

const applySetupPatch = (patch: SetupPatch) => {
  if (typeof patch.isOpenAtLogin === 'boolean') {
    config.isOpenAtLogin = patch.isOpenAtLogin
    applyLoginItem()
  }

  if (typeof patch.isUpdateCheck === 'boolean') {
    config.isUpdateCheck = patch.isUpdateCheck
    scheduleUpdates(config.isUpdateCheck && !IS_E2E)
  }

  if (typeof patch.isWhipOn === 'boolean') setWhip(patch.isWhipOn)

  if (LANGUAGES.includes(patch.language as (typeof LANGUAGES)[number])) {
    config.language = patch.language!
    applyLanguage()
  }

  persist()
  send('state', stateForRenderer())
  refreshTray()
}

// --- Shortcuts ------------------------------------------------------------------

const registerShortcuts = () => {
  globalShortcut.unregisterAll()
  failedShortcuts = []

  const bind = (accelerator: string, action: () => void) => {
    let isBound = false

    try {
      isBound = globalShortcut.register(accelerator, action)
    } catch {
      isBound = false
    }

    if (!isBound) {
      failedShortcuts.push(accelerator)
    }
  }

  bind(config.shortcuts.interactive, () => setInteractive(!isInteractive))
  bind(config.shortcuts.visible, () => setVisible(!isVisible, `shortcut ${config.shortcuts.visible}`))
}

// --- Tray -----------------------------------------------------------------------

/** The tray icon, rasterized here: a little desk with a screen, so no image file ships. */
const trayIcon = () => {
  const size = 32
  const pixels = Buffer.alloc(size * size * 4)

  const box = (x0: number, y0: number, x1: number, y1: number, r: number, g: number, b: number) => {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const at = (y * size + x) * 4
        // Windows reads this buffer as BGRA.
        pixels[at] = b
        pixels[at + 1] = g
        pixels[at + 2] = r
        pixels[at + 3] = 255
      }
    }
  }

  // A screen in Claude's warm orange, a darker stand and a desk.
  box(5, 4, 27, 19, 0xd9, 0x77, 0x57)
  box(8, 7, 24, 16, 0x2b, 0x21, 0x1c)
  box(10, 9, 15, 11, 0xf5, 0xf0, 0xe6)
  box(10, 12, 20, 14, 0xf5, 0xf0, 0xe6)
  box(14, 19, 18, 23, 0x8a, 0x55, 0x2a)
  box(3, 23, 29, 27, 0xb0, 0x7a, 0x4a)

  return nativeImage.createFromBitmap(pixels, { width: size, height: size, scaleFactor: 2 })
}

const radio = <T extends string>(values: readonly T[], current: T, label: (value: T) => string, pick: (value: T) => void): MenuItemConstructorOptions[] =>
  values.map(value => ({ label: label(value), type: 'radio', checked: current === value, click: () => pick(value) }))

const setWhip = (isOn: boolean) => {
  config.isWhipOn = isOn
  persist()
  send('state', stateForRenderer())
  refreshTray()
}

const refreshTray = () => {
  if (!tray) {
    return
  }

  const update = updateState()
  const displays = screen.getAllDisplays()

  const template: MenuItemConstructorOptions[] = [
    {
      label: config.isWhipOn ? t('tray.interactiveWhip') : t('tray.interactive'),
      type: 'checkbox',
      checked: isInteractive,
      accelerator: config.shortcuts.interactive,
      click: () => setInteractive(!isInteractive),
    },
    {
      label: t('tray.visible'),
      type: 'checkbox',
      checked: isVisible,
      accelerator: config.shortcuts.visible,
      click: () => setVisible(!isVisible, 'tray'),
    },
    { type: 'separator' },
    { label: t('tray.spend'), click: () => send('command', { type: 'spend' }) },
    { label: t('tray.report'), click: () => send('command', { type: 'report' }) },
    {
      label: t('tray.office'),
      submenu: [
        { label: t('tray.show'), type: 'checkbox', checked: config.isOfficeShown, click: () => applyPatch({ isOfficeShown: !config.isOfficeShown }) },
        { type: 'separator' },
        ...radio(CORNERS, config.officeCorner, value => t(`tray.corner.${value}`), value => applyPatch({ officeCorner: value })),
        { type: 'separator' },
        ...radio(SIZES, config.officeSize, value => t('tray.size', { value: t(`tray.sizes.${value}`) }), value => applyPatch({ officeSize: value })),
        { type: 'separator' },
        ...radio(STYLES, config.officeStyle, value => t('tray.style', { value: t(`tray.styles.${value}`) }), value => applyPatch({ officeStyle: value })),
        { type: 'separator' },
        ...radio(LAYOUTS, config.officeLayout, value => t('tray.layout', { value: t(`tray.layouts.${value}`) }), value => applyPatch({ officeLayout: value })),
        { type: 'separator' },
        ...radio(THEMES, config.officeTheme, value => t('tray.theme', { value: t(`tray.themes.${value}`) }), value => applyPatch({ officeTheme: value })),
        { type: 'separator' },
        { label: t('tray.calm'), type: 'checkbox', checked: config.isCalm, click: () => applyPatch({ isCalm: !config.isCalm }) },
        {
          label: t('tray.demo'),
          submenu: [
            ...SCENES.map(
              (one): MenuItemConstructorOptions => ({
                label: t(`tray.scenes.${one.value}`),
                type: 'radio',
                checked: scene?.kind === one.value,
                click: () => playScene(one.value),
              }),
            ),
            { type: 'separator' },
            { label: t('tray.demoOff'), enabled: scene !== null, click: () => playScene(null) },
          ],
        },
      ],
    },
    {
      label: t('tray.notices'),
      submenu: [
        {
          label: t('tray.notifying'),
          type: 'checkbox',
          checked: config.isNotifying,
          click: () => {
            config.isNotifying = !config.isNotifying
            persist()
            refreshTray()
          },
        },
        { label: t('tray.alertSound'), type: 'checkbox', checked: config.isAlertSound, click: () => applyPatch({ isAlertSound: !config.isAlertSound }) },
        { type: 'separator' },
        { label: t('tray.mute'), type: 'checkbox', checked: config.isMuted, click: () => applyPatch({ isMuted: !config.isMuted }) },
        {
          label: t('tray.volume'),
          submenu: VOLUME_STEPS.map(step => ({
            label: `${Math.round(step * 100)} %`,
            type: 'radio' as const,
            checked: Math.abs(config.volume - step) < 0.13,
            click: () => applyPatch({ volume: step }),
          })),
        },
      ],
    },
    ...(displays.length > 1
      ? [
          {
            label: t('tray.display'),
            submenu: displays.map((display, index) => ({
              label: t('tray.displayItem', {
                n: index + 1,
                primary: display.id === screen.getPrimaryDisplay().id ? t('tray.displayPrimary') : '',
                width: display.size.width,
                height: display.size.height,
              }),
              type: 'radio' as const,
              checked: display.id === targetDisplay().id,
              click: () => moveToDisplay(display.id),
            })),
          },
        ]
      : []),
    {
      label: t('tray.whip'),
      submenu: [
        { label: t('tray.whipOn'), type: 'checkbox', checked: config.isWhipOn, click: () => setWhip(!config.isWhipOn) },
        { label: t('tray.whipHint'), enabled: false },
        { type: 'separator' },
        ...radio(PROFILES, config.whipProfile, value => t(`tray.profiles.${value}`), value => applyPatch({ whipProfile: value })).map(item => ({
          ...item,
          enabled: config.isWhipOn,
        })),
        { type: 'separator' },
        { label: t('tray.targets'), type: 'checkbox', checked: config.isTargets, enabled: config.isWhipOn, click: () => applyPatch({ isTargets: !config.isTargets }) },
        { label: t('tray.recenter'), enabled: config.isWhipOn, click: () => send('command', { type: 'recenter' }) },
      ],
    },
    {
      label: t('tray.record'),
      submenu: [
        { label: t('tray.clip'), click: () => send('command', { type: 'clip' }) },
        { label: t('tray.timelapse'), click: () => send('command', { type: 'timelapse' }) },
        { label: t('tray.exportReplay'), click: () => send('command', { type: 'export-replay' }) },
        { type: 'separator' },
        { label: t('tray.openReplay'), click: () => void openReplay() },
        { label: t('tray.openRecordings'), click: () => void shell.openPath(recordingsDir()) },
      ],
    },
    {
      label: t('tray.language'),
      submenu: radio(LANGUAGES, config.language, value => t(`tray.languages.${value}`), value => applySetupPatch({ language: value })),
    },
    { type: 'separator' },
    { label: t('tray.setup'), click: () => openSetup() },
    ...(update.kind === 'ready'
      ? [{ label: t('tray.restartToUpdate', { version: update.version }), click: () => installNow() }]
      : update.kind === 'available' && isPortable()
        ? [{ label: t('update.portable', { version: update.version }), click: () => void shell.openExternal(RELEASES_URL) }]
        : [{ label: t('tray.checkUpdates'), enabled: app.isPackaged && update.kind !== 'checking', click: () => checkNow(true) }]),
    { label: t('tray.isUpdateCheck'), type: 'checkbox', checked: config.isUpdateCheck, click: () => applySetupPatch({ isUpdateCheck: !config.isUpdateCheck }) },
    { label: t('tray.openAtLogin'), type: 'checkbox', checked: config.isOpenAtLogin, click: () => applySetupPatch({ isOpenAtLogin: !config.isOpenAtLogin }) },
    {
      label: t('tray.openConfig'),
      click: () => {
        persist()
        void shell.openPath(configPath())
      },
    },
    { label: t('tray.diagnostics'), click: () => askDiagnostics() },
    ...(failedShortcuts.length > 0 ? [{ label: t('tray.shortcutTaken', { list: failedShortcuts.join(', ') }), enabled: false }] : []),
    { type: 'separator' },
    { label: t('tray.quit'), click: () => app.quit() },
  ]

  const menu = Menu.buildFromTemplate(template)
  menu.on('menu-will-close', () => setTimeout(resetMouse, 100))
  tray.setContextMenu(menu)
  const mode = isVisible ? (isInteractive ? t('tray.modeInteractive') : t('tray.modePassive')) : t('tray.modeHidden')
  tray.setToolTip(t('tray.tooltip', { mode, shortcut: config.shortcuts.interactive }))
}

const createTray = () => {
  tray = new Tray(trayIcon())
  tray.on('click', () => setInteractive(!isInteractive))
  refreshTray()
}

const playScene = (kind: SceneKind | null) => {
  scene = kind ? { kind, since: Date.now() } : null
  refreshTray()
}

// --- Renderer messages ------------------------------------------------------------

/** Takes from a patch only the fields that are known, each checked on its own. */
const applyPatch = (patch: SavePatch) => {
  if (typeof patch !== 'object' || patch === null) return

  const keys = [
    'isMuted',
    'volume',
    'isOfficeShown',
    'officeTheme',
    'officeLayout',
    'officeStyle',
    'whipProfile',
    'isTargets',
    'isCalm',
    'isAlertSound',
    'officeCorner',
    'officeSize',
    'anchor',
  ] as const

  for (const key of keys) {
    if (!(key in patch)) continue

    const parsed = FIELDS[key].safeParse(patch[key])

    // `.catch` turns a bad value into the default: only a value that fits as given is taken.
    if (parsed.success && JSON.stringify(parsed.data) === JSON.stringify(patch[key])) {
      ;(config as Record<string, unknown>)[key] = parsed.data
    }
  }

  persist()
  send('state', stateForRenderer())
  refreshTray()
}

/** Only the app's own pages may talk to the main process. */
const sameUrl = (a: string, b: string) => {
  try {
    return decodeURIComponent(a).toLowerCase() === decodeURIComponent(b).toLowerCase()
  } catch {
    return false
  }
}

const isOurs = (event: IpcMainEvent | IpcMainInvokeEvent) => {
  const url = event.senderFrame?.url ?? ''

  return sameUrl(url, pageUrl('index.html')) || sameUrl(url, pageUrl('setup.html'))
}

const fromOverlay = (event: IpcMainEvent | IpcMainInvokeEvent) => isOurs(event) && win !== null && event.sender === win.webContents
const fromSetup = (event: IpcMainEvent | IpcMainInvokeEvent) => isOurs(event) && setupWin !== null && event.sender === setupWin.webContents

const on = (channel: string, listener: (event: IpcMainEvent, ...args: unknown[]) => void) =>
  ipcMain.on(channel, (event, ...args) => {
    if (fromOverlay(event)) listener(event, ...args)
  })

const handle = (channel: string, listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown, check = fromOverlay) =>
  ipcMain.handle(channel, (event, ...args) => {
    if (!check(event)) throw new Error('not allowed')

    return listener(event, ...args)
  })

/** The same error is written once a minute at most, and the log stops growing at 1 MB. */
const ERROR_REPEAT_MS = 60_000
const ERROR_LOG_MAX_BYTES = 1024 * 1024
const lastErrors = new Map<string, number>()

/** The page's errors, in a file next to the config: what went wrong, when. */
const logError = (text: string) => {
  const line = text.slice(0, 4000)
  const now = Date.now()

  if (now - (lastErrors.get(line) ?? 0) < ERROR_REPEAT_MS) return

  if (lastErrors.size > 200) lastErrors.clear()
  lastErrors.set(line, now)

  try {
    const file = path.join(app.getPath('userData'), 'errors.log')
    const size = fs.existsSync(file) ? fs.statSync(file).size : 0

    // Full: the older half goes, the newer half stays.
    if (size > ERROR_LOG_MAX_BYTES) fs.writeFileSync(file, fs.readFileSync(file).subarray(Math.floor(size / 2)))

    fs.appendFileSync(file, `${new Date(now).toISOString()} ${line}\n`)
  } catch {
    // Nowhere to write: nothing more to do.
  }
}

const wireRenderer = () => {
  handle('ready', () => {
    // A renderer that (re)loads gets the agents on the next read.
    lastLive = ''

    // The spending ledger again, for a renderer that just (re)loaded.
    setTimeout(sendSpend, 100)

    if (IS_SELFTEST) {
      // A scene of the demo, frozen mid-way: every view of the office has something to show.
      setTimeout(() => send('agents', [sceneAt('team', 22, Date.now())]), 50)
    }

    return stateForRenderer()
  })

  on('capture', (_event, next) => {
    isCapturing = next === true
    applyMouse()
  })

  on('interactive', (_event, next) => setInteractive(next === true))
  on('hide', () => setVisible(false, 'Hide button'))
  on('save', (_event, patch) => applyPatch((patch ?? {}) as SavePatch))
  on('notify', (_event, title, body) => {
    if (!config.isNotifying || typeof title !== 'string') return

    showNote(title, String(body ?? ''), () => send('command', { type: 'spend' }))
  })

  // A limit window past 80 %: said once per window (its reset time names it).
  on('limits', (_event, limits) => {
    if (!Array.isArray(limits) || !config.isNotifying) return

    for (const limit of limits.slice(0, 8) as { kind?: unknown; percentUsed?: unknown; resetsAt?: unknown }[]) {
      const used = Number(limit?.percentUsed)
      // One warning per window: its reset time, to five minutes (sessions report it a little apart).
      const resetsAt = typeof limit?.resetsAt === 'string' ? Date.parse(limit.resetsAt) : Number.NaN
      const key = `${String(limit?.kind)}:${Number.isFinite(resetsAt) ? Math.round(resetsAt / 300_000) : String(limit?.resetsAt)}`

      if (!(used >= 80) || warnedLimits.has(key)) continue

      warnedLimits.add(key)
      const name = limit.kind === 'five_hour' ? t('notify.limitFiveHour') : limit.kind === 'seven_day' ? t('notify.limitWeekly') : t('notify.limitOther')
      const resets = typeof limit.resetsAt === 'string' && limit.resetsAt ? new Date(limit.resetsAt) : null
      const when = resets && Number.isFinite(resets.getTime()) ? resets.toLocaleString(localeOf(currentLanguage()), { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : ''
      showNote(t('notify.limitUsed', { percent: Math.round(used), name }), when ? t('notify.limitResets', { when }) : '', () =>
        send('command', { type: 'spend' }),
      )
    }
  })

  on('diagnostics', (_event, report) => saveDiagnostics(report))

  on('renderer-error', (_event, text) => logError(String(text)))
  handle('save-recording', (_event, name, bytes) => saveRecording(name, bytes))

  handle('selftest-shot', async (_event, name) => {
    if (IS_SELFTEST && typeof name === 'string' && /^\w{1,20}$/.test(name)) {
      shots[name] = await capture(name)
    }
  })

  on('selftest-done', (_event, report) => {
    if (IS_SELFTEST) void finishSelftest((report ?? {}) as Record<string, unknown>)
  })

  // The guide's window.
  handle('setup-view', () => setupView(), fromSetup)
  handle('setup-refresh', () => {
    refreshSetup()

    return setupView()
  }, fromSetup)
  handle(
    'setup-copy',
    (_event, text) => {
      // Only the commands the guide shows can be copied.
      const all = [...MOD_COMMANDS.install, ...MOD_COMMANDS.update, ...MOD_COMMANDS.enable]

      if (typeof text === 'string' && all.includes(text)) clipboard.writeText(text)
    },
    fromSetup,
  )
  handle('setup-save', (_event, patch) => {
    applySetupPatch((patch ?? {}) as SetupPatch)

    return setupView()
  }, fromSetup)
  handle('setup-demo', () => playScene('team'), fromSetup)
  handle('setup-open', (_event, what) => {
    // Only these two pages, in the person's browser.
    if (what === 'repo') void shell.openExternal(REPO_URL)
    if (what === 'releases') void shell.openExternal(RELEASES_URL)
  }, fromSetup)
  handle('setup-close', () => setupWin?.close(), fromSetup)
}

// --- The office's agents ---------------------------------------------------------------

// --- Spending: time and tokens per project and session -----------------------------------

/** How often the transcripts are read again for what they grew by. */
const SPEND_SCAN_MS = 60_000
const ledgerPath = () => path.join(app.getPath('userData'), 'ledger.json')
let ledger: ReturnType<typeof loadLedger> | null = null
let isScanning = false
/** The first scan's result is sent even when it found nothing: the panel then says so instead of "reading". */
let hasSentSpend = false

const sendSpend = () => {
  if (ledger) send('spend', { sessions: summaryOf(ledger), clientFolders: config.clientFolders })
}

const scanSpend = async () => {
  if (isScanning || IS_SELFTEST) return

  isScanning = true

  try {
    ledger ??= loadLedger(ledgerPath())

    const isChanged = await scan(ledger, TRANSCRIPTS_DIR)

    if (isChanged) saveLedger(ledgerPath(), ledger)

    if (isChanged || !hasSentSpend) {
      hasSentSpend = true
      sendSpend()
    }
  } catch (error) {
    console.error('Could not read the sessions’ spending:', error)
  } finally {
    isScanning = false
  }
}

/** What Claude Code reported a live session cost, written into its ledger entry. */
const takeCosts = (sessions: LiveSession[]) => {
  if (!ledger) return

  for (const session of sessions) {
    const usd = (session.usage as { usd?: unknown } | undefined | null)?.usd
    const entry = Object.hasOwn(ledger.sessions, session.id) ? ledger.sessions[session.id] : undefined

    if (entry && typeof usd === 'number' && usd > entry.usd) entry.usd = usd
  }
}

// --- "It got stuck": a snapshot of both sides, saved for a look ---------------------------

/** Main's own events: mode, capture and visibility changes, with when. */
const mainEvents: string[] = []

export const noteMain = (what: string) => {
  mainEvents.push(`${new Date().toISOString().slice(11, 23)} ${what}`)
  if (mainEvents.length > 200) mainEvents.splice(0, mainEvents.length - 200)
}

let diagTimer: ReturnType<typeof setTimeout> | null = null

/** Asks the renderer for its side; if it does not answer (frozen), saves main's alone. */
const askDiagnostics = () => {
  send('command', { type: 'diag' })
  diagTimer = setTimeout(() => saveDiagnostics({ renderer: 'no answer in 2 seconds' }), 2000)
}

const saveDiagnostics = (renderer: unknown) => {
  if (diagTimer) clearTimeout(diagTimer)
  diagTimer = null

  const cursor = screen.getCursorScreenPoint()
  const report = {
    at: new Date().toISOString(),
    version: app.getVersion(),
    main: {
      isVisible,
      isInteractive,
      isCapturing,
      windowVisible: win && !win.isDestroyed() ? win.isVisible() : null,
      bounds: win && !win.isDestroyed() ? win.getBounds() : null,
      cursor,
      alwaysOnTop: win && !win.isDestroyed() ? win.isAlwaysOnTop() : null,
      failedShortcuts,
      events: [...mainEvents],
    },
    renderer,
  }

  try {
    const file = path.join(app.getPath('userData'), `diagnostico-${report.at.replace(/[:.]/g, '-')}.json`)
    fs.writeFileSync(file, JSON.stringify(report, null, 2).slice(0, 2_000_000))
    showNote(t('notify.diagnosticsSaved'), t('notify.diagnosticsBody'), () => shell.showItemInFolder(file))
  } catch {
    // Nowhere to write: nothing more to do.
  }
}

// --- Windows notifications ------------------------------------------------------------

/** What each agent was last poll, by session and id; null before the first. */
let seen: Map<string, Seen> | null = null

const notify = (sessions: LiveSession[]) => {
  const { seen: next, notes } = changesOf(seen, sessions, (kind, name) => t(`notify.${kind}`, { name }), t('notify.anAgent'))
  seen = next

  if (!config.isNotifying) return

  // A burst (a whole workflow ending) is one notification, not a dozen.
  const shown = notes.length > 3 ? [{ title: t('notify.burst', { count: notes.length }), body: notes.map(note => note.title).join(' · ') }] : notes

  for (const note of shown) {
    showNote(note.title, note.body)
  }
}

// --- Recordings ---------------------------------------------------------------------------

/** Where clips, timelapses and replays are saved: Videos\Oficina de agentes. */
const recordingsDir = () => {
  const dir = path.join(app.getPath('videos'), 'Oficina de agentes')
  fs.mkdirSync(dir, { recursive: true })

  return dir
}

/** The largest replay file opened, matching what the renderer accepts. */
const REPLAY_MAX_BYTES = 25 * 1024 * 1024
/** The largest recording saved: a timelapse of a long day stays well under it. */
const RECORDING_MAX_BYTES = 512 * 1024 * 1024

const saveRecording = (name: unknown, bytes: unknown) => {
  // Bytes cross the bridge as an ArrayBuffer or a view of one, depending on the way over.
  const data =
    bytes instanceof ArrayBuffer ? Buffer.from(bytes) : ArrayBuffer.isView(bytes) ? Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength) : null

  // Only a plain file name of ours, with one of our endings, is ever written, and only in the recordings folder.
  if (typeof name !== 'string' || !/^[\w.-]{1,120}\.(webm|json)$/.test(name) || name.startsWith('.') || !data || data.byteLength > RECORDING_MAX_BYTES) {
    throw new Error('invalid recording')
  }

  const file = path.join(recordingsDir(), name)
  fs.writeFileSync(file, data)
  showNote(t('notify.recordingSaved'), name, () => shell.showItemInFolder(file))

  return file
}

const openReplay = async () => {
  const picked = await dialog.showOpenDialog({
    title: t('notify.replayTitle'),
    defaultPath: recordingsDir(),
    filters: [{ name: t('notify.replayFilter'), extensions: ['json'] }],
    properties: ['openFile'],
  })
  const file = picked.filePaths[0]

  if (picked.canceled || !file) return

  try {
    if (fs.statSync(file).size > REPLAY_MAX_BYTES) throw new Error('too large')

    // Parsed here, checked field by field in the renderer; nothing in it runs.
    send('replay', JSON.parse(fs.readFileSync(file, 'utf8')))
  } catch (error) {
    dialog.showErrorBox(t('notify.replayError'), String(error))
  }
}

// --- Starting with Windows --------------------------------------------------------------

/** The file Windows should start: the installed .exe, the portable one, or Electron with the project's folder. */
const applyLoginItem = () => {
  if (IS_SELFTEST || IS_E2E) return

  try {
    app.setLoginItemSettings(
      app.isPackaged
        ? { openAtLogin: config.isOpenAtLogin, path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath }
        : { openAtLogin: config.isOpenAtLogin, path: process.execPath, args: [app.getAppPath()] },
    )
  } catch (error) {
    console.error('Could not set the start with Windows:', error)
  }
}

const pollLive = () => {
  const now = Date.now()
  const sessions = [...readLive(LIVE_DIR, now), ...(scene ? [sceneAt(scene.kind, (now - scene.since) / 1000, now)] : [])]
  const json = JSON.stringify(sessions)

  if (json !== lastLive) {
    lastLive = json
    send('agents', sessions)
    notify(sessions)
    takeCosts(sessions)
  }
}

// --- Selftest -----------------------------------------------------------------------

/** Saves what the window drew and measures how much of it is see-through. */
const capture = async (name: string) => {
  if (!win) {
    return { error: 'no window' }
  }

  const image = await win.webContents.capturePage()
  const { width, height } = image.getSize()
  const bitmap = image.toBitmap()
  let clear = 0
  let solid = 0

  for (let at = 3; at < bitmap.length; at += 4) {
    if (bitmap[at] === 0) clear += 1
    else if (bitmap[at] > 200) solid += 1
  }

  const total = width * height
  const alphaAt = (x: number, y: number) => bitmap[(y * width + x) * 4 + 3]
  fs.mkdirSync(SELFTEST_DIR, { recursive: true })
  fs.writeFileSync(path.join(SELFTEST_DIR, `${name}.png`), image.toPNG())

  return {
    width,
    height,
    clearShare: Number((clear / total).toFixed(4)),
    solidPixels: solid,
    cornerAlpha: [alphaAt(0, 0), alphaAt(width - 1, 0), alphaAt(0, height - 1), alphaAt(width - 1, height - 1)],
  }
}

const finishSelftest = async (report: Record<string, unknown>) => {
  shots.rest = await capture('rest')

  // The mode switches, exercised for real; whether clicks then pass through
  // is something only a person with a mouse can confirm.
  const modes: Record<string, unknown> = {}
  setInteractive(true)
  modes.interactiveDoesNotThrow = true
  isCapturing = true
  applyMouse()
  setVisible(false)
  modes.hidingLeavesPassive = !isInteractive && !isCapturing
  modes.hiddenIsNotVisible = !isVisible
  setVisible(true)
  modes.shownAgain = isVisible && (win ? win.isVisible() : false)

  const display = screen.getPrimaryDisplay()
  const full = {
    renderer: report,
    shots,
    modes,
    window: win
      ? {
          bounds: win.getBounds(),
          isAlwaysOnTop: win.isAlwaysOnTop(),
          isFocusable: win.isFocusable(),
          isFocused: win.isFocused(),
        }
      : null,
    display: { workArea: display.workArea, scaleFactor: display.scaleFactor, displays: screen.getAllDisplays().length },
    shortcuts: { wanted: config.shortcuts, failed: failedShortcuts },
    versions: { electron: process.versions.electron, chrome: process.versions.chrome },
  }

  fs.mkdirSync(SELFTEST_DIR, { recursive: true })
  fs.writeFileSync(path.join(SELFTEST_DIR, 'report.json'), JSON.stringify(full, null, 2))
  app.quit()
}

// --- Hardening ---------------------------------------------------------------------

/**
 * The pages are the app's own files and never need anything else: no
 * navigation, no new windows, no permissions, no network. The updater has
 * its own session, so blocking the network here does not stop it.
 */
const harden = () => {
  const own = session.defaultSession
  own.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  own.setPermissionCheckHandler(() => false)
  own.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*', 'ftp://*/*'] }, (_details, callback) =>
    callback({ cancel: true }),
  )

  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', event => event.preventDefault())
    contents.on('will-redirect', event => event.preventDefault())
    contents.on('will-attach-webview', event => event.preventDefault())
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  })
}

// --- App ----------------------------------------------------------------------------

// The whip and the alert must be able to sound before any click.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

if (!IS_SELFTEST && !app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    setVisible(true, 'opened again')
    openSetup()
  })

  // Windows shows notifications under this name.
  app.setAppUserModelId(APP_ID)

  void app.whenReady().then(() => {
    harden()
    servePages()

    // The first run after the rename takes the old folder's config and ledger along.
    if (!IS_SELFTEST && !IS_E2E && !process.env[ENV.userDataDir]) carryOver(legacyDir, app.getPath('userData'))

    const loaded = IS_SELFTEST ? { config: structuredClone(DEFAULTS), brokenCopy: null } : loadConfigFile(configPath())
    config = loaded.config
    applyLanguage()

    // A config that is not JSON (a hand edit) was kept aside before the defaults take its place.
    if (loaded.brokenCopy) {
      const copy = loaded.brokenCopy
      config.isOnboarded = true
      showNote(t('notify.configBroken'), t('notify.configBrokenBody', { file: path.basename(copy) }), () => shell.showItemInFolder(copy))
    }
    applyLoginItem()
    wireRenderer()
    refreshSetup()
    createWindow()
    createTray()
    registerShortcuts()
    refreshTray()

    setupUpdates({
      onState: () => refreshTray(),
      notify: (key, version) => {
        const body = key === 'available' ? t('update.availableBody') : key === 'portable' ? t('update.portableBody') : key === 'ready' ? t('update.readyBody') : ''
        const title = key === 'none' ? t('update.none', { version }) : key === 'error' ? t('update.error') : t(`update.${key}`, { version })
        showNote(title, body, key === 'portable' ? () => void shell.openExternal(RELEASES_URL) : undefined)
      },
    })
    scheduleUpdates(config.isUpdateCheck && !IS_E2E && !IS_SELFTEST)

    if (!IS_SELFTEST) {
      setInterval(pollLive, LIVE_POLL_MS)
      setInterval(pollPointer, 33)
      setInterval(refreshSetup, SETUP_POLL_MS)
      setTimeout(() => void scanSpend(), IS_E2E ? 500 : 3000)
      setInterval(() => void scanSpend(), IS_E2E ? 2000 : SPEND_SCAN_MS)

      // The first run opens the guide; afterwards, the tray does.
      if (!config.isOnboarded) openSetup()
    }

    screen.on('display-metrics-changed', fitToDisplay)
    screen.on('display-added', fitToDisplay)
    screen.on('display-removed', fitToDisplay)
  })

  // The tray keeps the app alive; quitting is the tray's "Quit".
  app.on('window-all-closed', () => {
    // Closing the guide leaves the office running.
    if (!win) app.quit()
  })
  app.on('will-quit', () => globalShortcut.unregisterAll())
}
