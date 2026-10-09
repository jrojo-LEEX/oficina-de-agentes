// What the first-run guide checks: is there a Claude Code folder, is the
// Oficina mod installed (from the marketplace, or loaded from a folder), and
// what the live snapshots say about it. Only reads, and only Claude Code's
// own bookkeeping files. No Electron here, so a test can reach it.

import * as fs from 'node:fs'
import * as path from 'node:path'

import { isOldMod, parseSnapshot } from './snapshot'

/** The plugin's name in the marketplace: `oficina@<marketplace>`. */
export const PLUGIN_NAME = 'oficina'
/** A snapshot newer than this says the mod is running right now. */
const RECENT_MS = 10 * 60_000
/** The same bounds the live reader keeps: a snapshot is a few kilobytes. */
const MAX_BYTES = 2 * 1024 * 1024
const MAX_FILES = 500

export type ModSource = 'marketplace' | 'folder' | 'seen' | null

export type SetupStatus = {
  claudeDir: string
  /** Claude Code has run here: its folder exists. */
  hasClaude: boolean
  /** Where the mod comes from: installed from a marketplace, a folder Claude Code loads, or only seen writing. */
  modSource: ModSource
  /** Installed, but turned off in Claude Code's settings. */
  isModDisabled: boolean
  /** The version installed or last seen writing; '' when unknown. */
  modVersion: string
  /** A snapshot came from a mod older than this app needs. */
  isModOld: boolean
  /** Live sessions writing right now. */
  liveSessions: number
}

const readJson = (file: string): unknown => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''))
  } catch {
    return null
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** `oficina@<marketplace>` entries in Claude Code's installed-plugins file, with the version of the first. */
const installedFromMarketplace = (claudeDir: string) => {
  const data = readJson(path.join(claudeDir, 'plugins', 'installed_plugins.json'))
  const plugins = isRecord(data) && isRecord(data.plugins) ? data.plugins : {}

  for (const [key, installs] of Object.entries(plugins)) {
    if (!key.startsWith(`${PLUGIN_NAME}@`)) continue

    const first = Array.isArray(installs) && isRecord(installs[0]) ? installs[0] : {}

    return { key, version: typeof first.version === 'string' ? first.version : '' }
  }

  return null
}

/** Folders Claude Code's settings load as plugins (CLAUDE_CODE_PLUGIN_DIRS) that hold the Oficina mod. */
const loadedFromFolder = (settings: Record<string, unknown>, env: Record<string, string | undefined>) => {
  const fromSettings = isRecord(settings.env) && typeof settings.env.CLAUDE_CODE_PLUGIN_DIRS === 'string' ? settings.env.CLAUDE_CODE_PLUGIN_DIRS : ''
  const folders = [fromSettings, env.CLAUDE_CODE_PLUGIN_DIRS ?? ''].flatMap(list => list.split(path.delimiter)).filter(Boolean)

  for (const folder of folders) {
    const manifest = readJson(path.join(folder, '.claude-plugin', 'plugin.json'))

    if (isRecord(manifest) && manifest.name === PLUGIN_NAME) {
      return { version: typeof manifest.version === 'string' ? manifest.version : '' }
    }
  }

  return null
}

export const setupStatus = (claudeDir: string, liveDir: string, now: number, env: Record<string, string | undefined> = process.env): SetupStatus => {
  const settings = readJson(path.join(claudeDir, 'settings.json'))
  const settingsRecord = isRecord(settings) ? settings : {}
  const fromMarketplace = installedFromMarketplace(claudeDir)
  const fromFolder = loadedFromFolder(settingsRecord, env)
  const enabled = isRecord(settingsRecord.enabledPlugins) ? settingsRecord.enabledPlugins : {}

  let liveSessions = 0
  let seenVersion = ''
  let isSeenOld = false

  try {
    for (const name of fs.readdirSync(liveDir).filter(one => one.endsWith('.json')).slice(0, MAX_FILES)) {
      const file = path.join(liveDir, name)
      const stat = fs.statSync(file)

      if (!stat.isFile() || stat.size > MAX_BYTES) continue

      const snapshot = parseSnapshot(fs.readFileSync(file, 'utf8'))

      if (!snapshot || now - snapshot.updatedAt > RECENT_MS) continue

      if (!snapshot.isEnded) liveSessions += 1
      seenVersion ||= snapshot.modVersion
      isSeenOld ||= isOldMod(snapshot)
    }
  } catch {
    // No folder yet: no session has written one.
  }

  const modSource: ModSource = fromMarketplace ? 'marketplace' : fromFolder ? 'folder' : seenVersion || liveSessions > 0 ? 'seen' : null

  return {
    claudeDir,
    hasClaude: fs.existsSync(claudeDir),
    modSource,
    isModDisabled: fromMarketplace !== null && enabled[fromMarketplace.key] === false,
    modVersion: fromMarketplace?.version || fromFolder?.version || seenVersion,
    isModOld: isSeenOld,
    liveSessions,
  }
}
