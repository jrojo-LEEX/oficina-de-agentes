// The app's config: %APPDATA%\oficina-de-agentes\config.json. Every field
// has a default and is checked on its own, so one bad value (a hand edit, an
// older version's) falls back alone instead of taking the rest with it. The
// file is read with or without a byte-order mark (an editor that adds one
// once left the app on its defaults) and always written without one, aside
// and swapped in. No Electron here, so a test can reach it.

import * as fs from 'node:fs'
import * as path from 'node:path'

import { z } from 'zod'

/** The config shape this version writes. 1 is the whip-first app's, before the rename. */
export const CONFIG_VERSION = 2

const corner = z.enum(['br', 'bl', 'tr', 'tl'])
const size = z.enum(['s', 'm', 'l'])
const theme = z.enum(['auto', 'normal', 'night', 'party'])
const layout = z.enum(['horizontal', 'tower', 'wings'])
const style = z.enum(['ilustrado', 'pixel'])
const profile = z.enum(['classic', 'short', 'long', 'flexible'])
const language = z.enum(['auto', 'es', 'en'])
const point = z.object({ x: z.number().finite(), y: z.number().finite() })
const accelerator = z.string().min(1).max(60)

/** A folder name a client is read from (`clients\acme\...`): letters, digits, dot, dash, underscore. */
const folderName = z.string().regex(/^[\w.-]{1,40}$/)

export const DEFAULTS = {
  configVersion: CONFIG_VERSION,
  shortcuts: { interactive: 'Control+Alt+L', visible: 'Control+Alt+H' },
  volume: 0.8,
  isMuted: false,
  anchor: null as { x: number; y: number } | null,
  isOfficeShown: true,
  officeCorner: 'br' as z.infer<typeof corner>,
  officeSize: 'm' as z.infer<typeof size>,
  /** The display the office lives on; null for the primary one. */
  displayId: null as number | null,
  officeTheme: 'auto' as z.infer<typeof theme>,
  officeLayout: 'horizontal' as z.infer<typeof layout>,
  officeStyle: 'ilustrado' as z.infer<typeof style>,
  isCalm: false,
  /** The whip: an optional toy, off until the person turns it on from the tray. */
  isWhipOn: false,
  whipProfile: 'classic' as z.infer<typeof profile>,
  isTargets: false,
  /** A sound when someone starts waiting for permission. */
  isAlertSound: true,
  /** Windows notifications when an agent waits, finishes or fails. */
  isNotifying: true,
  /** Opens with Windows, not only by hand. */
  isOpenAtLogin: true,
  /** `auto` follows Windows' language. */
  language: 'auto' as z.infer<typeof language>,
  /** Asks GitHub for a newer version now and then: the app's only network call. */
  isUpdateCheck: true,
  /**
   * Folder names that hold one folder per client (`clients\acme\repo`): a
   * session under one counts for that client. Empty: no clients, only projects.
   */
  clientFolders: [] as string[],
  /** The first-run guide was seen (it can always be opened again from the tray). */
  isOnboarded: false,
}

export type Config = typeof DEFAULTS

/** Each field checked on its own: a value that does not fit is replaced by its default. */
const schema = z.object({
  configVersion: z.literal(CONFIG_VERSION).catch(CONFIG_VERSION),
  shortcuts: z
    .object({ interactive: accelerator.catch(DEFAULTS.shortcuts.interactive), visible: accelerator.catch(DEFAULTS.shortcuts.visible) })
    .catch(DEFAULTS.shortcuts),
  volume: z.number().min(0).max(1).catch(DEFAULTS.volume),
  isMuted: z.boolean().catch(DEFAULTS.isMuted),
  anchor: point.nullable().catch(DEFAULTS.anchor),
  isOfficeShown: z.boolean().catch(DEFAULTS.isOfficeShown),
  officeCorner: corner.catch(DEFAULTS.officeCorner),
  officeSize: size.catch(DEFAULTS.officeSize),
  displayId: z.number().int().nullable().catch(DEFAULTS.displayId),
  officeTheme: theme.catch(DEFAULTS.officeTheme),
  officeLayout: layout.catch(DEFAULTS.officeLayout),
  officeStyle: style.catch(DEFAULTS.officeStyle),
  isCalm: z.boolean().catch(DEFAULTS.isCalm),
  isWhipOn: z.boolean().catch(DEFAULTS.isWhipOn),
  whipProfile: profile.catch(DEFAULTS.whipProfile),
  isTargets: z.boolean().catch(DEFAULTS.isTargets),
  isAlertSound: z.boolean().catch(DEFAULTS.isAlertSound),
  isNotifying: z.boolean().catch(DEFAULTS.isNotifying),
  isOpenAtLogin: z.boolean().catch(DEFAULTS.isOpenAtLogin),
  language: language.catch(DEFAULTS.language),
  isUpdateCheck: z.boolean().catch(DEFAULTS.isUpdateCheck),
  clientFolders: z.array(z.unknown()).transform(list => list.filter(name => folderName.safeParse(name).success) as string[]).catch(DEFAULTS.clientFolders),
  isOnboarded: z.boolean().catch(DEFAULTS.isOnboarded),
})

// Kept honest: the checked shape is exactly the defaults' shape.
const _sameShape: Config = {} as z.infer<typeof schema>
void _sameShape

/** The field schemas, for checking a patch from the renderer one value at a time. */
export const FIELDS = schema.shape

const freshDefaults = (): Config => structuredClone(DEFAULTS)

/**
 * Brings an older config up to this version. Version 1 (no `configVersion`)
 * is the whip-first app's: whoever used it had the whip in hand and the
 * client folders read from `clients` and `clientes`, so both stay as they were.
 */
export const migrate = (raw: Record<string, unknown>): Record<string, unknown> => {
  // The old app always wrote every field: an empty file is not one of its.
  const version = typeof raw.configVersion === 'number' ? raw.configVersion : Object.keys(raw).length > 0 ? 1 : CONFIG_VERSION
  let next = { ...raw }

  if (version < 2) {
    next = {
      ...next,
      isWhipOn: typeof raw.isWhipOn === 'boolean' ? raw.isWhipOn : true,
      clientFolders: Array.isArray(raw.clientFolders) ? raw.clientFolders : ['clients', 'clientes'],
      configVersion: 2,
    }
  }

  return next
}

/** A config from the file's text: a byte-order mark tolerated, anything unreadable left to the defaults. */
export const parseConfig = (text: string): Config => {
  let raw: unknown

  try {
    raw = JSON.parse(text.replace(/^﻿/, ''))
  } catch {
    return freshDefaults()
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return freshDefaults()

  // Missing fields get their defaults; fields of the future are dropped.
  return schema.parse({ ...freshDefaults(), ...migrate(raw as Record<string, unknown>) }) as Config
}

/** What the file holds: two-space JSON, UTF-8 without a byte-order mark. */
export const serializeConfig = (config: Config) => `${JSON.stringify(config, null, 2)}\n`

/** Reads the config, or the defaults when there is none. */
export const loadConfig = (file: string): Config => {
  try {
    return parseConfig(fs.readFileSync(file, 'utf8'))
  } catch {
    return freshDefaults()
  }
}

/** Writes a file aside and swaps it in, so a crash never leaves half of it. Never with a byte-order mark. */
export const writeAtomic = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const aside = `${file}.${process.pid}.tmp`
  fs.writeFileSync(aside, Buffer.from(text.replace(/^﻿/, ''), 'utf8'))
  fs.renameSync(aside, file)
}

export const saveConfig = (file: string, config: Config) => writeAtomic(file, serializeConfig(config))

/**
 * The first run after the rename: the old folder's config and ledger are
 * copied into the new one (never moved; the old folder stays as it was).
 * Returns what was carried over.
 */
export const carryOver = (fromDir: string, toDir: string) => {
  const carried: string[] = []

  for (const name of ['config.json', 'ledger.json']) {
    const from = path.join(fromDir, name)
    const to = path.join(toDir, name)

    try {
      if (fs.existsSync(to) || !fs.existsSync(from)) continue

      fs.mkdirSync(toDir, { recursive: true })
      fs.copyFileSync(from, to)
      carried.push(name)
    } catch {
      // Nothing carried: the app starts fresh, and the ledger is rebuilt from the transcripts.
    }
  }

  return carried
}
