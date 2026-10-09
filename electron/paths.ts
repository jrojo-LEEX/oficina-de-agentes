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

const given = (value: string | undefined) => (value && value.trim() ? value.trim() : '')

/** `~` and `~/x` as the home folder, the rest made absolute. */
export const expandHome = (value: string, home: string) =>
  path.resolve(value === '~' ? home : value.startsWith('~/') || value.startsWith('~\\') ? path.join(home, value.slice(2)) : value)

/** Claude Code's own folder: CLAUDE_CONFIG_DIR when set, else ~/.claude. */
export const claudeDirOf = (env: Env = process.env, home = os.homedir()) => {
  const named = given(env.CLAUDE_CONFIG_DIR)

  return named ? expandHome(named, home) : path.join(home, '.claude')
}

/** Where the mod writes one snapshot per live session. */
export const liveDirOf = (env: Env = process.env, home = os.homedir()) => {
  const named = given(env[ENV.liveDir])

  return named ? expandHome(named, home) : path.join(claudeDirOf(env, home), 'oficina-live')
}

/** Where Claude Code keeps every session's transcript: what spending is read from. */
export const transcriptsDirOf = (env: Env = process.env, home = os.homedir()) => path.join(claudeDirOf(env, home), 'projects')

/** The app's own folder: OFICINA_USER_DATA_DIR when set, else %APPDATA%\oficina-de-agentes. */
export const userDataDirOf = (appData: string, env: Env = process.env, home = os.homedir()) => {
  const named = given(env[ENV.userDataDir])

  return named ? expandHome(named, home) : path.join(appData, USER_DATA_NAME)
}

/**
 * Whether `file` is inside `dir` (or is it): what keeps a path that came
 * from elsewhere within the folder it belongs to. Compared without case,
 * as Windows does.
 */
export const isInside = (dir: string, file: string) => {
  const relative = path.relative(path.resolve(dir).toLowerCase(), path.resolve(file).toLowerCase())

  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}
