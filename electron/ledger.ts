// The spending ledger: time and tokens per project and per Claude Code
// session, read from the transcripts Claude Code keeps on this machine
// (~/.claude/projects). Only numbers are kept: when each message came, how
// many tokens each answer used, the session's title and its folder. What
// was said is never stored. Files are read once, then only what they grow
// by, so a scan after the first costs next to nothing. No Electron here, so
// a test can reach it.

import * as fs from 'node:fs'
import * as path from 'node:path'

import { z } from 'zod'

/** One day of one session. */
export type DayBucket = {
  /** Milliseconds of activity: gaps between the session's own events, each up to IDLE_GAP_MS. */
  activeMs: number
  /** Fresh input tokens, and the input written to the prompt cache. */
  input: number
  cacheWrite: number
  /** Input read back from the prompt cache. */
  cacheRead: number
  output: number
  /** Answers counted (each once, however many lines it was written in). */
  replies: number
  /** The same, per model. */
  models?: Record<string, ModelBucket>
}

/** One model's share of a day: answers, new tokens (input and cache written), output, cache read. */
export type ModelBucket = { replies: number; fresh: number; output: number; cacheRead: number }

export type SessionEntry = {
  id: string
  /** The project: the session's folder, a worktree counted as its repository. */
  project: string
  projectPath: string
  title: string
  firstAt: number
  lastAt: number
  /** The last event of the main conversation, for the next gap. */
  lastEventAt: number
  days: Record<string, DayBucket>
  /** What Claude Code reported it cost, while the Oficina mod was watching it; 0 when unknown. */
  usd: number
  /** The folder the session last ran in: what its client is read from. */
  cwd: string
  /** Active milliseconds per hour, keyed `YYYY-MM-DD HH`: the map of when work happens. */
  hours: Record<string, number>
  /** Answers per model. */
  models: Record<string, number>
  /** The last answers counted, so one written over several lines (or read across two scans) counts once. */
  recentIds: string[]
}

export type FileState = { offset: number; size: number }

export type Ledger = { version: 4; files: Record<string, FileState>; sessions: Record<string, SessionEntry> }

/** A gap longer than this between two events is a pause, not work. */
export const IDLE_GAP_MS = 5 * 60_000
const RECENT_IDS = 60
const CHUNK = 4 * 1024 * 1024

export const emptyLedger = (): Ledger => ({ version: 4, files: {}, sessions: {} })

export const dayOf = (at: number) => {
  const date = new Date(at)

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const roots = new Map<string, string>()

/**
 * The repository a folder is inside: the nearest folder up with a `.git`, a
 * dozen levels at most; the folder itself when there is none. A session that
 * moved into a subfolder still counts in its repository.
 */
const repoRootOf = (folder: string) => {
  const known = roots.get(folder)

  if (known !== undefined) return known

  let root = folder
  let at = folder

  for (let level = 0; level < 12; level++) {
    if (fs.existsSync(path.join(at, '.git'))) {
      root = at
      break
    }

    const up = path.dirname(at)

    if (up === at) break

    at = up
  }

  roots.set(folder, root)

  return root
}

/**
 * The project a folder belongs to. A worktree of a repository counts as the
 * repository (`repo\.claude\worktrees\name` is `repo`); a session started
 * without a folder runs in a scratch folder the app made, named by its date.
 */
export const projectOf = (cwd: string) => {
  const scratch = /scratch-workspaces[\\/].*scratch-(\d{4})-(\d{2})-(\d{2})/i.exec(cwd)

  if (scratch) return { name: `Sin carpeta · ${scratch[3]}/${scratch[2]}`, path: cwd.replace(/[\\/]+$/, '') }

  const folder = cwd.replace(/[\\/]\.claude[\\/]worktrees[\\/][^\\/]+.*$/i, '').replace(/[\\/]+$/, '')
  const root = repoRootOf(folder)
  const name = root.split(/[\\/]/).filter(Boolean).pop() ?? root

  return { name, path: root }
}

const bucket = (entry: SessionEntry, at: number): DayBucket => {
  const day = dayOf(at)
  entry.days[day] ??= { activeMs: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0, replies: 0 }

  return entry.days[day]!
}

const entryOf = (ledger: Ledger, id: string): SessionEntry => {
  ledger.sessions[id] ??= {
    id,
    project: '',
    projectPath: '',
    title: '',
    firstAt: 0,
    lastAt: 0,
    lastEventAt: 0,
    days: {},
    cwd: '',
    hours: {},
    usd: 0,
    models: {},
    recentIds: [],
  }

  return ledger.sessions[id]!
}

const tokens = z.number().finite().nonnegative().catch(0)
const maybeText = z.string().optional().catch(undefined)

/**
 * The only fields of a transcript line the ledger ever reads. Everything
 * else (what was said, tool inputs and outputs) is dropped on parsing, and a
 * field of the wrong kind counts as absent.
 */
const lineSchema = z.object({
  sessionId: maybeText,
  cwd: maybeText,
  type: maybeText,
  customTitle: maybeText,
  timestamp: maybeText,
  isSidechain: z.boolean().optional().catch(undefined),
  message: z
    .object({
      id: maybeText,
      model: maybeText,
      usage: z
        .object({ input_tokens: tokens, cache_creation_input_tokens: tokens, cache_read_input_tokens: tokens, output_tokens: tokens })
        .optional()
        .catch(undefined),
    })
    .optional()
    .catch(undefined),
})

/**
 * Takes in one line of a transcript. `fileSession` is the session the file
 * belongs to (its name, or its folder for a subagent's), `isMain` whether it
 * is the session's own conversation: only that one counts time, since a
 * subagent works alongside it.
 */
export const takeLine = (ledger: Ledger, line: string, fileSession: string, isMain: boolean) => {
  let o: z.infer<typeof lineSchema>

  try {
    const parsed = lineSchema.safeParse(JSON.parse(line))

    if (!parsed.success) return

    o = parsed.data
  } catch {
    return
  }

  const id = typeof o.sessionId === 'string' && o.sessionId ? o.sessionId : fileSession
  const entry = entryOf(ledger, id)

  // The latest folder wins: a session moved to a project counts in that project.
  if (typeof o.cwd === 'string' && o.cwd && isMain) {
    const project = projectOf(o.cwd)
    entry.project = project.name
    entry.cwd = o.cwd
    entry.projectPath = project.path
  }

  if (o.type === 'custom-title' && typeof o.customTitle === 'string') {
    entry.title = o.customTitle.slice(0, 120)
  }

  const at = typeof o.timestamp === 'string' ? Date.parse(o.timestamp) : NaN

  if (!Number.isFinite(at)) return

  entry.firstAt = entry.firstAt ? Math.min(entry.firstAt, at) : at
  entry.lastAt = Math.max(entry.lastAt, at)

  if (isMain && o.isSidechain !== true) {
    const gap = entry.lastEventAt ? at - entry.lastEventAt : 0

    if (gap > 0 && gap <= IDLE_GAP_MS) {
      bucket(entry, at).activeMs += gap
      const hour = `${dayOf(at)} ${String(new Date(at).getHours()).padStart(2, '0')}`
      entry.hours[hour] = (entry.hours[hour] ?? 0) + gap
    }
    if (at > entry.lastEventAt) entry.lastEventAt = at
  }

  const message = o.message

  if (o.type !== 'assistant' || !message?.usage || typeof message.id !== 'string') return
  if (entry.recentIds.includes(message.id)) return

  entry.recentIds.push(message.id)
  if (entry.recentIds.length > RECENT_IDS) entry.recentIds.splice(0, entry.recentIds.length - RECENT_IDS)

  const usage = message.usage
  const n = (key: keyof typeof usage) => usage[key]
  const day = bucket(entry, at)
  day.input += n('input_tokens')
  day.cacheWrite += n('cache_creation_input_tokens')
  day.cacheRead += n('cache_read_input_tokens')
  day.output += n('output_tokens')
  day.replies += 1

  // Claude Code's own notices (`<synthetic>`) carry a usage but no model: not counted per model.
  if (typeof message.model === 'string' && message.model && !message.model.startsWith('<')) {
    day.models ??= {}
    const share = (day.models[message.model] ??= { replies: 0, fresh: 0, output: 0, cacheRead: 0 })
    share.replies += 1
    share.fresh += n('input_tokens') + n('cache_creation_input_tokens') + n('output_tokens')
    share.output += n('output_tokens')
    share.cacheRead += n('cache_read_input_tokens')
  }

  if (typeof message.model === 'string' && !message.model.startsWith('<')) {
    entry.models[message.model] = (entry.models[message.model] ?? 0) + 1
  }
}

/** Every transcript under `root`, with the session it belongs to and whether it is the main conversation. */
const transcripts = async (root: string) => {
  const found: { file: string; session: string; isMain: boolean }[] = []

  const walk = async (dir: string, session: string | null) => {
    let entries: fs.Dirent[] = []

    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const one of entries) {
      const full = path.join(dir, one.name)

      if (one.isDirectory()) {
        // A session's own folder holds its subagents' transcripts.
        await walk(full, session ?? (/^[0-9a-f-]{36}$/i.test(one.name) ? one.name : null))
      } else if (one.name.endsWith('.jsonl')) {
        found.push({ file: full, session: session ?? one.name.replace(/\.jsonl$/, ''), isMain: session === null })
      }
    }
  }

  await walk(root, null)

  return found
}

/**
 * Reads what every transcript under `root` grew by since the last scan.
 * Returns whether anything changed. Yields between files so the app stays responsive.
 */
export const scan = async (ledger: Ledger, root: string) => {
  let isChanged = false

  for (const { file, session, isMain } of await transcripts(root)) {
    let size = 0

    try {
      size = (await fs.promises.stat(file)).size
    } catch {
      continue
    }

    const state = ledger.files[file] ?? { offset: 0, size: 0 }

    // Shorter than read so far: rewritten, so read from the start.
    if (size < state.offset) state.offset = 0
    if (size === state.offset) continue

    const handle = await fs.promises.open(file, 'r')
    let carry = ''

    try {
      let position = state.offset

      while (position < size) {
        const length = Math.min(CHUNK, size - position)
        const buffer = Buffer.alloc(length)
        const { bytesRead } = await handle.read(buffer, 0, length, position)

        if (bytesRead === 0) break

        const text = carry + buffer.subarray(0, bytesRead).toString('utf8')
        const end = text.lastIndexOf('\n')
        // Only whole lines: a half-written last one waits for the next scan.
        const whole = end >= 0 ? text.slice(0, end) : ''
        carry = end >= 0 ? text.slice(end + 1) : text

        for (const line of whole.split('\n')) {
          if (line.trim()) takeLine(ledger, line, session, isMain)
        }

        position += bytesRead
      }

      state.offset = size - Buffer.byteLength(carry, 'utf8')
      state.size = size
      ledger.files[file] = state
      isChanged = true
    } finally {
      await handle.close()
    }

    await new Promise(resolve => setImmediate(resolve))
  }

  return isChanged
}

const count = z.number().finite().nonnegative()
const dayBucket = z.object({
  activeMs: count,
  input: count,
  cacheWrite: count,
  cacheRead: count,
  output: count,
  replies: count,
  models: z.record(z.string(), z.object({ replies: count, fresh: count, output: count, cacheRead: count })).optional(),
})
const ledgerSchema = z.object({
  version: z.literal(4),
  files: z.record(z.string(), z.object({ offset: count, size: count })),
  sessions: z.record(
    z.string(),
    z.object({
      id: z.string(),
      project: z.string(),
      projectPath: z.string(),
      title: z.string(),
      firstAt: count,
      lastAt: count,
      lastEventAt: count,
      days: z.record(z.string(), dayBucket),
      usd: count,
      cwd: z.string(),
      hours: z.record(z.string(), count),
      models: z.record(z.string(), count),
      recentIds: z.array(z.string()),
    }),
  ),
})

/**
 * A ledger read back from disk, or an empty one when it is missing,
 * unreadable or damaged anywhere: the next scan then rebuilds it from the
 * transcripts. (Only the costs Claude Code reported live cannot be rebuilt.)
 */
export const loadLedger = (file: string): Ledger => {
  try {
    const parsed = ledgerSchema.safeParse(JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')))

    return parsed.success ? (parsed.data as Ledger) : emptyLedger()
  } catch {
    return emptyLedger()
  }
}

export const saveLedger = (file: string, ledger: Ledger) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  // Written aside and swapped in, so a crash never leaves half a ledger.
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(ledger))
  fs.renameSync(`${file}.tmp`, file)
}

/** What the renderer needs: each session without the bookkeeping. */
export const summaryOf = (ledger: Ledger) =>
  Object.values(ledger.sessions)
    .filter(entry => entry.firstAt > 0)
    .map(({ recentIds: _ids, lastEventAt: _last, ...entry }) => entry)
