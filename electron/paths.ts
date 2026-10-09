// Where everything lives. Claude Code keeps its folder at ~/.claude unless
// CLAUDE_CONFIG_DIR names another; the mod writes its live snapshots inside
// that folder and Claude Code its transcripts. Two variables of our own let
// tests (and odd setups) point elsewhere. No Electron here, so a test can reach it.

import * as os from 'node:os'
import * as path from 'node:path'

export type Env = Record<string, string | undefined>

/** The variables this app reads, besides Claude Code's own CLAUDE_CONFIG_DIR. */
export const ENV = {
  /** Another folder for the live snapshots (the mod reads the same one). */
  liveDir: 'OFICINA_LIVE_DIR',
  /** Another folder for the app's own config, ledger and logs. */
  userDataDir: 'OFICINA_USER_DATA_DIR',
} as const

/** The folder name under %APPDATA% for the app's config, ledger and logs. */
export const USER_DATA_NAME = 'oficina-de-agentes'
/** Where versions before the rename kept them, read once to carry them over. */
export const LEGACY_USER_DATA_NAME = 'latigo-overlay'

/**
 * An absolute local path: `C:\...`, `C:/...` or `/...`; never relative, never
 * `~`, never a network share. The mod reads the same variables by the same
 * rule (plugin/oficina/hooks/register.tsx), so both always agree on the folder.
 */
export const isAbsoluteLocal = (value: string) => /^([A-Za-z]:[\\/]|\/(?![\\/]))/.test(value)

/** A variable's value when it names an absolute local path; anything else counts as unset. */
const given = (value: string | undefined) => {
  const trimmed = value?.trim() ?? ''

  return isAbsoluteLocal(trimmed) ? path.resolve(trimmed) : ''
}

/** Claude Code's own folder: CLAUDE_CONFIG_DIR when set, else ~/.claude. */
export const claudeDirOf = (env: Env = process.env, home = os.homedir()) => given(env.CLAUDE_CONFIG_DIR) || path.join(home, '.claude')

/** Where the mod writes one snapshot per live session. */
export const liveDirOf = (env: Env = process.env, home = os.homedir()) => given(env[ENV.liveDir]) || path.join(claudeDirOf(env, home), 'oficina-live')

/** Where Claude Code keeps every session's transcript: what spending is read from. */
export const transcriptsDirOf = (env: Env = process.env, home = os.homedir()) => path.join(claudeDirOf(env, home), 'projects')

/** The app's own folder: OFICINA_USER_DATA_DIR when set, else %APPDATA%\oficina-de-agentes. */
export const userDataDirOf = (appData: string, env: Env = process.env) => given(env[ENV.userDataDir]) || path.join(appData, USER_DATA_NAME)

/**
 * Whether `file` is inside `dir` (or is it): what keeps a path that came
 * from elsewhere within the folder it belongs to. Compared without case,
 * as Windows does.
 */
export const isInside = (dir: string, file: string) => {
  const relative = path.relative(path.resolve(dir).toLowerCase(), path.resolve(file).toLowerCase())

  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}
