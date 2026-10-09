// Time and tokens per project and per session, over a period: what the
// spending panel shows. The numbers come from the main process's ledger,
// read off Claude Code's own transcripts.

import { currentLanguage, localeOf, t } from './i18n.ts'
import type { Language } from './i18n.ts'

export type ModelBucket = { replies: number; fresh: number; output: number; cacheRead: number }

export type DayBucket = {
  activeMs: number
  input: number
  cacheWrite: number
  cacheRead: number
  output: number
  replies: number
  models?: Record<string, ModelBucket>
}

export type SpendSession = {
  id: string
  project: string
  projectPath: string
  title: string
  firstAt: number
  lastAt: number
  days: Record<string, DayBucket>
  usd: number
  models: Record<string, number>
  /** The folder it last ran in: what its client is read from. */
  cwd?: string
  /** Active milliseconds per hour, keyed `YYYY-MM-DD HH`. */
  hours?: Record<string, number>
}

/**
 * The client a session worked for: the folder right under one of `folders`
 * (say `clients`) in its path, if any. No folders, no clients.
 */
export const clientOf = (session: { cwd?: string; projectPath: string }, folders: readonly string[]) => {
  if (folders.length === 0) return null

  const names = new Set(folders.map(folder => folder.toLowerCase()))
  const parts = (session.cwd || session.projectPath).split(/[\\/]+/).filter(Boolean)

  for (let i = 0; i < parts.length - 1; i++) {
    if (names.has(parts[i]!.toLowerCase())) return parts[i + 1]!
  }

  return null
}

/** `claude-opus-5-5` → `Opus 5.5`; anything else as it is. */
export const modelName = (model: string) => {
  const found = /claude-(opus|sonnet|haiku|fable)-(\d+)(?:-(\d{1,2}))?(?:-|$)/i.exec(model)

  if (!found) return model

  const family = found[1]!.charAt(0).toUpperCase() + found[1]!.slice(1).toLowerCase()

  return `${family} ${found[2]}${found[3] ? `.${found[3]}` : ''}`
}

export type Period = 'today' | 'week' | 'month' | 'all'

/** The periods the panel offers; their names are `spend.periods.*`. */
export const PERIODS: readonly Period[] = ['today', 'week', 'month', 'all']

export type Totals = DayBucket & { usd: number; sessions: number }

export type Row = Totals & { key: string; name: string; detail: string; lastAt: number }

const dayOf = (at: number) => {
  const date = new Date(at)

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** The first day a period counts, as `YYYY-MM-DD`; '' for all of it. */
export const firstDayOf = (period: Period, now: number) => {
  if (period === 'all') return ''

  const back = period === 'today' ? 0 : period === 'week' ? 6 : 29
  const date = new Date(now)

  return dayOf(new Date(date.getFullYear(), date.getMonth(), date.getDate() - back).getTime())
}

const zero = (): Totals => ({ activeMs: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0, replies: 0, usd: 0, sessions: 0 })

/** Everything one session did within the period. */
const within = (session: SpendSession, from: string): Totals => {
  const sum = zero()

  for (const [day, bucket] of Object.entries(session.days)) {
    if (day < from) continue

    sum.activeMs += bucket.activeMs
    sum.input += bucket.input
    sum.cacheWrite += bucket.cacheWrite
    sum.cacheRead += bucket.cacheRead
    sum.output += bucket.output
    sum.replies += bucket.replies
  }

  const isIn = sum.replies > 0 || sum.activeMs > 0
  // A reported cost belongs to the whole session: counted when the session falls in the period.
  sum.usd = isIn ? session.usd : 0
  sum.sessions = isIn ? 1 : 0

  return sum
}

const add = (a: Totals, b: Totals): Totals => ({
  activeMs: a.activeMs + b.activeMs,
  input: a.input + b.input,
  cacheWrite: a.cacheWrite + b.cacheWrite,
  cacheRead: a.cacheRead + b.cacheRead,
  output: a.output + b.output,
  replies: a.replies + b.replies,
  usd: a.usd + b.usd,
  sessions: a.sessions + b.sessions,
})

/**
 * What a session is grouped by: its project's folder, or, for the folderless
 * ones, their name (one per day). A key, never shown: the ledger names those
 * `Sin carpeta · …` whatever the language.
 */
/** A project's name to show: the ledger names folderless sessions `Sin carpeta · dd/mm`, said here in the page's language. */
export const projectName = (project: string) => {
  const folderless = /^Sin carpeta · (.+)$/.exec(project)

  return folderless ? t('spend.noFolder', { date: folderless[1] }) : project || t('spend.noProject')
}

const groupOf = (session: SpendSession) =>
  (session.project.startsWith('Sin carpeta') ? session.project : session.projectPath || session.project || '-').toLowerCase()

/** All tokens an answer went through: fresh input, cache written and read, and output. */
export const tokensOf = (totals: DayBucket) => totals.input + totals.cacheWrite + totals.cacheRead + totals.output

/**
 * The tokens that are new each time: input (fresh and written to the cache)
 * and output. Reading the cache back is counted apart: it repeats the same
 * context on every answer and is far cheaper.
 */
export const freshOf = (totals: DayBucket) => totals.input + totals.cacheWrite + totals.output

/** Per project and per session within a period, the busiest first, and the period's total. */
export const spendOf = (sessions: SpendSession[], period: Period, now: number, clientFolders: readonly string[] = []) => {
  const from = firstDayOf(period, now)
  const projects = new Map<string, Row>()
  const rows: Row[] = []
  let total = zero()

  for (const session of sessions) {
    const sum = within(session, from)

    if (sum.sessions === 0) continue

    total = add(total, sum)
    const project = projectName(session.project)
    const key = groupOf(session)
    const old = projects.get(key)
    projects.set(key, {
      ...add(old ?? zero(), sum),
      key,
      name: project,
      detail: session.projectPath,
      lastAt: Math.max(old?.lastAt ?? 0, session.lastAt),
    })
    rows.push({ ...sum, key: session.id, name: session.title || t('spend.session', { id: session.id.slice(0, 8) }), detail: project, lastAt: session.lastAt })
  }

  const byWork = (a: Row, b: Row) => freshOf(b) - freshOf(a) || b.activeMs - a.activeMs

  // Clients: each session counts for the client its folder names; the rest stay apart.
  const clients = new Map<string, Row>()

  for (const session of sessions) {
    const sum = within(session, from)

    if (sum.sessions === 0) continue

    const client = clientOf(session, clientFolders)
    const key = client ? `c:${client.toLowerCase()}` : `p:${groupOf(session)}`
    const old = clients.get(key)
    clients.set(key, {
      ...add(old ?? zero(), sum),
      key,
      name: client ?? t('spend.noClient', { project: projectName(session.project) }),
      detail: client ? projectName(session.project) : t('spend.noClientDetail'),
      lastAt: Math.max(old?.lastAt ?? 0, session.lastAt),
    })
  }

  // Models: tokens are per answer, so per model; time is not, so it is left out.
  const models = new Map<string, Row & { sessionIds: Set<string> }>()

  for (const session of sessions) {
    for (const [day, bucket] of Object.entries(session.days)) {
      if (day < from) continue

      for (const [model, share] of Object.entries(bucket.models ?? {})) {
        const name = modelName(model)
        const old = models.get(name) ?? { ...zero(), key: name, name, detail: model, lastAt: 0, sessionIds: new Set<string>() }
        old.replies += share.replies
        old.input += share.fresh - share.output
        old.output += share.output
        old.cacheRead += share.cacheRead
        old.sessionIds.add(session.id)
        old.sessions = old.sessionIds.size
        old.lastAt = Math.max(old.lastAt, session.lastAt)
        models.set(name, old)
      }
    }
  }

  return {
    projects: [...projects.values()].sort(byWork),
    clients: [...clients.values()].sort(byWork),
    models: [...models.values()].map(({ sessionIds: _ids, ...row }) => row).sort(byWork),
    sessions: rows.sort((a, b) => b.lastAt - a.lastAt),
    total,
  }
}

/** Each of the last `count` days, oldest first: active time and new tokens. */
export const dailyOf = (sessions: SpendSession[], now: number, count = 30) => {
  const today = new Date(now)
  const days = Array.from({ length: count }, (_, i) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (count - 1 - i))

    return { day: dayOf(date.getTime()), date, activeMs: 0, fresh: 0 }
  })
  const byDay = new Map(days.map(one => [one.day, one]))

  for (const session of sessions) {
    for (const [day, bucket] of Object.entries(session.days)) {
      const one = byDay.get(day)

      if (!one) continue

      one.activeMs += bucket.activeMs
      one.fresh += freshOf(bucket)
    }
  }

  return days
}

/** Active time by weekday (0 Monday … 6 Sunday) and hour, within a period. */
export const hoursOf = (sessions: SpendSession[], period: Period, now: number) => {
  const from = firstDayOf(period, now)
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))

  for (const session of sessions) {
    for (const [key, ms] of Object.entries(session.hours ?? {})) {
      const [day, hour] = key.split(' ')

      if (!day || day < from) continue

      const [y, m, d] = day.split('-').map(Number)
      const weekday = (new Date(y!, m! - 1, d!).getDay() + 6) % 7
      grid[weekday]![Number(hour)]! += ms
    }
  }

  return grid
}

/** A rate-limit window as Claude Code reports it. */
export type Limit = { kind: string; percentUsed: number; resetsAt: string }

/** Two reset times this close apart are the same window, read by two sessions. */
const SAME_WINDOW_MS = 5 * 60_000

/**
 * One figure per kind of window from what several sessions reported: each
 * session tells the use as of its own last answer, so a quiet one lags. The
 * latest window wins, and within it the highest use, which is the most recent.
 */
export const mergeLimits = (reported: Limit[], now = Date.now()): Limit[] => {
  const byKind = new Map<string, Limit>()

  for (const limit of reported) {
    if (!limit || typeof limit.kind !== 'string' || !Number.isFinite(limit.percentUsed)) continue

    const old = byKind.get(limit.kind)
    const at = Date.parse(limit.resetsAt) || 0

    // A window already reset, still told by a session that has not answered since: over.
    if (at && at < now) continue
    const oldAt = old ? Date.parse(old.resetsAt) || 0 : -Infinity

    if (!old || at - oldAt > SAME_WINDOW_MS || (Math.abs(at - oldAt) <= SAME_WINDOW_MS && limit.percentUsed > old.percentUsed)) {
      byKind.set(limit.kind, limit)
    }
  }

  // A steady order, so the line does not reshuffle: 5 hours first, then the week.
  const order = (kind: string) => (kind === 'five_hour' ? 0 : kind === 'seven_day' ? 1 : 2)

  return [...byKind.values()].sort((a, b) => order(a.kind) - order(b.kind))
}

/** A window's name in the current language; an unknown kind as it came. */
export const limitName = (kind: string) => t(`spend.limits.${kind}`, { defaultValue: kind })

/** "Límite de 5 h: 62 % (se renueva 18:40)", "5-hour limit: 62% (resets 6:40 PM)". */
export const limitLine = (limit: Limit, language: Language = currentLanguage()) => {
  const locale = localeOf(language)
  const resets = limit.resetsAt ? new Date(limit.resetsAt) : null
  const when =
    resets && Number.isFinite(resets.getTime())
      ? resets.toDateString() === new Date().toDateString()
        ? resets.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
        : resets.toLocaleString(locale, { weekday: 'short', hour: '2-digit', minute: '2-digit' })
      : ''
  const values = { lng: language, name: t(`spend.limits.${limit.kind}`, { lng: language, defaultValue: limit.kind }), percent: Math.round(limit.percentUsed), when }

  return when ? t('spend.limitResets', values) : t('spend.limitLine', values)
}

const formats = new Map<string, Intl.NumberFormat>()

/** A number with exactly `digits` decimals, written the language's way: 5,0 or 5.0. */
export const decimal = (value: number, digits = 1, language: Language = currentLanguage()) => {
  const key = `${language}:${digits}`
  let format = formats.get(key)

  if (!format) {
    format = new Intl.NumberFormat(localeOf(language), { minimumFractionDigits: digits, maximumFractionDigits: digits })
    formats.set(key, format)
  }

  return format.format(value)
}

/** Dollars, the language's way: "US$ 2,50" or "US$2.50". */
export const money = (usd: number, language: Language = currentLanguage()) => t('spend.money', { lng: language, amount: decimal(usd, 2, language) })

/** 1 234 567 → "1,2 M" ("1.2 M" in English); 8 500 → "8,5 k". */
export const shortTokens = (tokens: number, language: Language = currentLanguage()) =>
  tokens >= 1e9
    ? `${decimal(tokens / 1e9, 1, language)} B`
    : tokens >= 1e6
      ? `${decimal(tokens / 1e6, 1, language)} M`
      : tokens >= 1e3
        ? `${decimal(tokens / 1e3, 1, language)} k`
        : String(tokens)

/** 4 500 000 ms → "1 h 15 min": the same in both languages. */
export const shortTime = (ms: number) => {
  const minutes = Math.round(ms / 60_000)

  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`
}
