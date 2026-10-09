import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'

const ROOT = path.resolve(__dirname, '..', '..')

export type Stage = {
  /** The throwaway Claude Code folder (CLAUDE_CONFIG_DIR). */
  claude: string
  live: string
  /** The app's own throwaway folder (OFICINA_USER_DATA_DIR). */
  userData: string
}

/** A fresh Claude Code folder and app folder, with the app's config already written. */
export const stage = (config: Record<string, unknown> = {}): Stage => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-e2e-'))
  const claude = path.join(base, 'claude config')
  const userData = path.join(base, 'app')
  fs.mkdirSync(path.join(claude, 'projects'), { recursive: true })
  fs.mkdirSync(userData, { recursive: true })
  fs.writeFileSync(
    path.join(userData, 'config.json'),
    JSON.stringify({ configVersion: 2, language: 'es', isOpenAtLogin: false, isUpdateCheck: false, isOnboarded: true, ...config }),
  )

  return { claude, live: path.join(claude, 'oficina-live'), userData }
}

export const installMod = (at: Stage, version = '1.0.0') => {
  const file = path.join(at.claude, 'plugins', 'installed_plugins.json')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ version: 2, plugins: { 'oficina@oficina-de-agentes': [{ scope: 'user', version }] } }))
}

type Agent = { id: string; name: string; type?: string; status?: string; activity?: string }

/** Writes a live snapshot as the mod would, fresh as of now. */
export const writeSession = (at: Stage, session: string, label: string, agents: Agent[], usd = 0) => {
  const now = Date.now()
  fs.mkdirSync(at.live, { recursive: true })
  const snapshot = {
    schemaVersion: 1,
    modVersion: '1.0.0',
    session,
    label,
    cwd: `C:/work/${label}`,
    updatedAt: now,
    isEnded: false,
    agents: agents.map((agent, seq) => ({
      seq,
      type: 'general-purpose',
      kind: 'subagent',
      status: 'running',
      activity: 'working',
      detail: '',
      tools: 0,
      startedAt: now - 30_000,
      endedAt: 0,
      seenAt: now,
      isListed: true,
      isBackground: false,
      isDemo: false,
      note: '',
      files: [],
      trail: [],
      ...agent,
    })),
    boss: { status: 'working', activity: 'working', detail: '', since: now, files: [], trail: [] },
    usage: { tokens: 20_000, window: 200_000, percent: 10, usd, limits: [] },
  }
  // Written aside and swapped in, as the reader may look at any moment.
  const file = path.join(at.live, `${session}.json`)
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(snapshot))
  fs.renameSync(`${file}.tmp`, file)
}

/** A transcript: one prompt and one answer with the given tokens, a minute apart. */
export const writeTranscript = (at: Stage, session: string, folder: string, tokens: { input: number; output: number; cacheRead: number }) => {
  const dir = path.join(at.claude, 'projects', folder.replace(/[:\\/]/g, '-'))
  fs.mkdirSync(dir, { recursive: true })
  const start = Date.now() - 10 * 60_000
  const lines = [
    { type: 'user', sessionId: session, cwd: folder, timestamp: new Date(start).toISOString(), message: { role: 'user', content: 'hola' } },
    {
      type: 'assistant',
      sessionId: session,
      cwd: folder,
      timestamp: new Date(start + 60_000).toISOString(),
      message: {
        id: `msg_${session}`,
        model: 'claude-opus-5-5',
        usage: { input_tokens: tokens.input, cache_creation_input_tokens: 0, cache_read_input_tokens: tokens.cacheRead, output_tokens: tokens.output },
      },
    },
  ]
  fs.writeFileSync(path.join(dir, `${session}.jsonl`), `${lines.map(line => JSON.stringify(line)).join('\n')}\n`)
}

/** Starts the app against a stage. */
export const launch = async (at: Stage): Promise<ElectronApplication> => {
  const exe = process.env.OFICINA_E2E_EXE
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    CLAUDE_CONFIG_DIR: at.claude,
    OFICINA_USER_DATA_DIR: at.userData,
    OFICINA_E2E: '1',
  }
  // Nothing of the person's own Claude Code setup leaks in.
  delete env.OFICINA_LIVE_DIR
  delete env.CLAUDE_CODE_PLUGIN_DIRS

  return exe
    ? electron.launch({ executablePath: exe, args: [], env })
    : electron.launch({ executablePath: path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe'), args: [ROOT], env })
}

/** The window showing one of the app's pages. */
export const pageOf = async (app: ElectronApplication, name: 'index.html' | 'setup.html'): Promise<Page> => {
  const deadline = Date.now() + 20_000

  while (Date.now() < deadline) {
    const found = app.windows().find(page => page.url().endsWith(`/${name}`))

    if (found) {
      await found.waitForLoadState('domcontentloaded')

      return found
    }

    await new Promise(resolve => setTimeout(resolve, 200))
  }

  throw new Error(`No window with ${name}`)
}

/** The notifications the app showed, in order. */
export const notesOf = (app: ElectronApplication) =>
  app.evaluate(() => (globalThis as unknown as { __oficinaE2E: { notes: { title: string; body: string }[] } }).__oficinaE2E.notes)

/** Sends the page a command, as the tray would. */
export const command = (app: ElectronApplication, type: string) =>
  app.evaluate((_electron, name) => (globalThis as unknown as { __oficinaE2E: { command: (type: string) => void } }).__oficinaE2E.command(name), type)

export const cleanUp = (at: Stage) => fs.rmSync(path.dirname(at.claude), { recursive: true, force: true })
