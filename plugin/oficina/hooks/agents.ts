// The registry of agents: pure functions from one list to the next, fed by
// the events the hooks module hears. Nothing here guesses: a status changes
// only on evidence (an event, or the engine's own agent list).

import type { OficinaActivity, OficinaAgent, OficinaOutcome, OficinaStatus, OficinaTouch } from '../types/snapshot'

/** Files and outcomes kept per agent: enough for the app's views, small enough to publish often. */
const KEPT_TOUCHES = 8
const KEPT_OUTCOMES = 8

/** The file a tool call names, and whether it writes it. */
export const touchOf = (tool: string, args: Record<string, unknown>, now: number): OficinaTouch | null => {
  const path = [args.file_path, args.notebook_path, args.path].find(value => typeof value === 'string' && value !== '')

  return typeof path === 'string' ? { path, isWrite: EDITING.has(tool), at: now } : null
}

/** Finished agents kept for the tally and the details view. */
const KEPT_FINISHED = 30
/**
 * An agent the engine never listed (a workflow's) with no tool in flight is
 * still taken as thinking for this long after its last sign.
 */
const QUIET_MS = 90_000
/** An agent with no evidence for this long leaves the office (never as finished). */
const UNKNOWN_KEEP_MS = 5 * 60_000

const READING = new Set(['Read', 'NotebookRead', 'WebFetch'])
const SEARCHING = new Set(['Grep', 'Glob', 'WebSearch', 'ToolSearch', 'LS'])
const EDITING = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit'])

export const activityOf = (tool: string): OficinaActivity =>
  READING.has(tool) ? 'reading' : SEARCHING.has(tool) ? 'searching' : EDITING.has(tool) ? 'editing' : 'tool'

const short = (text: string, max = 22) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

const baseName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path

/** A few words of evidence about a tool call, from its own arguments. */
export const detailOf = (tool: string, args: Record<string, unknown>): string => {
  const text = (key: string) => (typeof args[key] === 'string' ? (args[key] as string) : '')
  const path = text('file_path') || text('notebook_path') || text('path')

  if (READING.has(tool) || EDITING.has(tool)) {
    if (path) return short(`${tool} ${baseName(path)}`)
    if (text('url')) return short(`${tool} ${text('url').replace(/^https?:\/\//, '').split('/')[0]}`)
  }

  if (SEARCHING.has(tool)) {
    return short(`${tool} ${text('pattern') || text('query') || baseName(path)}`.trim())
  }

  if (tool === 'Bash' || tool === 'PowerShell') {
    return short(`${tool} ${text('command').trim().split(/\s+/)[0] ?? ''}`.trim())
  }

  return short(tool.startsWith('mcp__') ? tool.split('__').slice(1).join(' ') : tool)
}

const nextSeq = (list: OficinaAgent[]) => list.reduce((max, agent) => Math.max(max, agent.seq), -1) + 1

const blank = (list: OficinaAgent[], id: string): OficinaAgent => ({
  id,
  seq: nextSeq(list),
  name: '',
  type: '',
  kind: 'subagent',
  status: 'running',
  activity: 'working',
  detail: '',
  tools: 0,
  startedAt: 0,
  endedAt: 0,
  seenAt: 0,
  isListed: false,
  isBackground: false,
  isDemo: false,
  note: '',
  files: [],
  trail: [],
})

const patch = (list: OficinaAgent[], id: string, change: (agent: OficinaAgent) => OficinaAgent) =>
  list.map(agent => (agent.id === id ? change(agent) : agent))

const has = (list: OficinaAgent[], id: string) => list.some(agent => agent.id === id)

export type Started = {
  id: string
  name?: string
  type?: string
  kind?: 'subagent' | 'teammate'
  isBackground?: boolean
  isDemo?: boolean
  parentId?: string
}

/** An agent started (or started again): witnessed, so its clock starts now. */
export const started = (list: OficinaAgent[], start: Started, now: number): OficinaAgent[] => {
  const fill = (agent: OficinaAgent): OficinaAgent => ({
    ...agent,
    name: start.name || agent.name,
    type: start.type || agent.type,
    kind: start.kind ?? agent.kind,
    isBackground: start.isBackground ?? agent.isBackground,
    isDemo: start.isDemo ?? agent.isDemo,
    parentId: start.parentId ?? agent.parentId,
    status: 'running',
    activity: 'working',
    detail: '',
    note: '',
    endedAt: 0,
    startedAt: agent.startedAt || now,
    seenAt: now,
  })

  return has(list, start.id) ? patch(list, start.id, fill) : [...list, fill(blank(list, start.id))]
}

/**
 * One of the agent's own tool calls began. An id nobody announced still is
 * evidence of a running loop, so it gets a character of unknown type.
 */
export const toolBegan = (
  list: OficinaAgent[],
  id: string,
  tool: string,
  detail: string,
  now: number,
  touch: OficinaTouch | null = null,
): OficinaAgent[] => {
  const known = has(list, id) ? list : [...list, { ...blank(list, id), startedAt: now }]

  return patch(known, id, agent => ({
    ...agent,
    status: 'running',
    endedAt: 0,
    note: '',
    activity: activityOf(tool),
    detail,
    tools: agent.tools + 1,
    seenAt: now,
    files: touch ? [...(agent.files ?? []).filter(one => one.path !== touch.path), touch].slice(-KEPT_TOUCHES) : (agent.files ?? []),
  }))
}

/** A tool call ended, well or badly: a failed tool is not a failed agent. */
export const toolEnded = (list: OficinaAgent[], id: string, now = 0, outcome: OficinaOutcome | null = null): OficinaAgent[] =>
  patch(list, id, agent => {
    const tools = Math.max(0, agent.tools - 1)
    const seenAt = Math.max(agent.seenAt, now)
    const trail = outcome ? [...(agent.trail ?? []), outcome].slice(-KEPT_OUTCOMES) : (agent.trail ?? [])

    return tools > 0 || agent.status !== 'running'
      ? { ...agent, tools, seenAt, trail }
      : { ...agent, tools, seenAt, trail, activity: 'working', detail: '' }
  })

/** The agent's tool call is held at a permission prompt: a person must act. */
export const waiting = (list: OficinaAgent[], id: string): OficinaAgent[] =>
  patch(list, id, agent => (agent.status === 'running' ? { ...agent, activity: 'waiting' } : agent))

export type TurnEnd = 'answer' | 'aborted' | 'refusal' | 'error'

/**
 * A turn of the agent's loop ended. A subagent's turn is its whole run; a
 * teammate's is one of many, so it goes idle instead of finishing.
 */
export const turnEnded = (list: OficinaAgent[], id: string, reason: TurnEnd, now: number): OficinaAgent[] =>
  patch(list, id, agent => {
    if (agent.kind === 'teammate' && reason === 'answer') {
      return { ...agent, status: 'idle', activity: 'working', detail: '', tools: 0, seenAt: now }
    }

    return {
      ...agent,
      status: reason === 'answer' ? 'done' : 'failed',
      note: reason === 'answer' ? '' : reason,
      activity: 'working',
      detail: '',
      tools: 0,
      endedAt: now,
      seenAt: now,
    }
  })

/** The settings hook's stop: an end with no reason given, so only a running agent takes it. */
export const stopped = (list: OficinaAgent[], id: string, now: number): OficinaAgent[] =>
  patch(list, id, agent =>
    agent.status === 'running' && agent.kind === 'subagent'
      ? { ...agent, status: 'done', activity: 'working', detail: '', tools: 0, endedAt: now, seenAt: now }
      : agent,
  )

export type Listed = { id: string; description: string; type: string; status: string; name?: string; parentId?: string }

const statusOfListed = (status: string): OficinaStatus | undefined =>
  status === 'running' || status === 'pending'
    ? 'running'
    : status === 'completed'
      ? 'done'
      : status === 'failed' || status === 'killed'
        ? 'failed'
        : undefined

/**
 * Squares the registry with the engine's own list of agents: the one source
 * that survives a reload. A listed agent the registry lacks is added with no
 * start time. A running agent the list stops naming becomes `unknown`, never
 * `done`; one the list never named (a workflow's) only after a long silence.
 * Hands back the same list when nothing changed, so a quiet poll redraws nothing.
 */
export const reconciled = (list: OficinaAgent[], listed: Listed[], now: number): OficinaAgent[] => {
  let next = list
  let isChanged = false

  const set = (id: string, change: (agent: OficinaAgent) => OficinaAgent) => {
    next = next.map(agent => {
      if (agent.id !== id) return agent

      const changed = change(agent)

      if (!isSame(agent, changed)) isChanged = true

      return changed
    })
  }

  for (const info of listed) {
    const status = statusOfListed(info.status)
    const kind: OficinaAgent['kind'] = info.type === 'teammate' ? 'teammate' : 'subagent'

    if (!has(next, info.id)) {
      // Finished before the mod could see it: not worth a desk.
      if (status !== 'running') continue

      next = [
        ...next,
        {
          ...blank(next, info.id),
          name: info.name || info.description,
          type: info.type,
          kind,
          status,
          seenAt: now,
          isListed: true,
          parentId: info.parentId,
        },
      ]
      isChanged = true

      continue
    }

    set(info.id, agent => {
      const named = {
        ...agent,
        name: agent.name || info.name || info.description,
        type: agent.type || info.type,
        kind,
        isListed: true,
        parentId: agent.parentId ?? info.parentId,
      }

      // A teammate whose first turn ended before the list told it apart from
      // a subagent: still running in the list, so it is between turns.
      if (status === 'running' && kind === 'teammate' && agent.kind !== 'teammate' && agent.status === 'done') {
        return { ...named, status: 'idle', endedAt: 0, seenAt: now }
      }

      if (status === undefined || status === agent.status) return named
      // An idle teammate is listed as running; the turn's end knows better.
      if (status === 'running' && agent.status === 'idle') return named
      // The mod's own events are fresher than a poll for a running agent.
      if (status === 'running' && agent.status !== 'unknown') return named

      return {
        ...named,
        status,
        note: status === 'failed' ? agent.note || info.status : '',
        endedAt: status === 'running' ? 0 : agent.endedAt || now,
        tools: status === 'running' ? agent.tools : 0,
        seenAt: now,
      }
    })
  }

  const names = new Set(listed.map(info => info.id))

  for (const agent of next) {
    const isSilent = agent.isListed || now - agent.seenAt > QUIET_MS

    if (!agent.isDemo && agent.status === 'running' && !names.has(agent.id) && agent.tools === 0 && isSilent) {
      set(agent.id, one => ({ ...one, status: 'unknown', activity: 'working', detail: '', seenAt: now }))
    }
  }

  return isChanged ? next : list
}

const isSame = (a: OficinaAgent, b: OficinaAgent) =>
  (Object.keys(b) as (keyof OficinaAgent)[]).every(key => a[key] === b[key])

/**
 * Keeps every live agent and the most recent finished ones. One with no
 * evidence for a long while is let go: it leaves, it is not called finished.
 */
export const pruned = (list: OficinaAgent[], now = 0): OficinaAgent[] => {
  const isStale = (agent: OficinaAgent) => now > 0 && agent.status === 'unknown' && now - agent.seenAt > UNKNOWN_KEEP_MS

  if (list.some(isStale)) {
    list = list.filter(agent => !isStale(agent))
  }

  const finished = list.filter(agent => agent.status === 'done' || agent.status === 'failed')

  if (finished.length <= KEPT_FINISHED) return list

  const drop = new Set(
    [...finished]
      .sort((a, b) => a.endedAt - b.endedAt)
      .slice(0, finished.length - KEPT_FINISHED)
      .map(agent => agent.id),
  )

  return list.filter(agent => !drop.has(agent.id))
}

export const withoutDemo = (list: OficinaAgent[]): OficinaAgent[] => list.filter(agent => !agent.isDemo)

export type Tally = { active: number; waiting: number; done: number; failed: number; unknown: number }

export const tally = (list: OficinaAgent[]): Tally => ({
  active: list.filter(agent => agent.status === 'running' || agent.status === 'idle').length,
  waiting: list.filter(agent => agent.status === 'running' && agent.activity === 'waiting').length,
  done: list.filter(agent => agent.status === 'done').length,
  failed: list.filter(agent => agent.status === 'failed').length,
  unknown: list.filter(agent => agent.status === 'unknown').length,
})
