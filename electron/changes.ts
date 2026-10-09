// Which agents just started waiting for permission, finished or failed,
// from one poll of the live sessions to the next: what becomes a Windows
// notification. No Electron here, so a test can reach it.

import type { LiveSession } from './shared'

export type Seen = { status: string; activity: string; name: string; session: string }

export type ChangeKind = 'waiting' | 'done' | 'failed'

/** How a change is said: the app passes its translated texts; the default is Spanish. */
export type Say = (kind: ChangeKind, name: string) => string

const SPANISH: Say = (kind, name) => (kind === 'waiting' ? `${name} espera tu permiso` : kind === 'done' ? `${name} terminó` : `${name} falló`)

/** One line per agent that just started waiting, finished or failed. Demo agents never notify. */
export const changesOf = (before: Map<string, Seen> | null, sessions: LiveSession[], say: Say = SPANISH, anAgent = 'Un agente') => {
  const now = new Map<string, Seen>()
  const notes: { title: string; body: string }[] = []

  for (const session of sessions) {
    // A demo scene is the app's own show: it never notifies.
    if (session.id.startsWith('demo-')) continue

    const label = session.label || 'Claude Code'
    const boss = session.boss as { status?: string } | undefined

    if (boss && typeof boss.status === 'string') {
      now.set(`${session.id}:boss`, { status: boss.status, activity: boss.status, name: 'Claude', session: label })
    }

    for (const raw of session.agents) {
      const agent = raw as { id?: unknown; status?: unknown; activity?: unknown; name?: unknown; type?: unknown; isDemo?: unknown; note?: unknown }

      if (typeof agent.id !== 'string' || agent.isDemo === true) continue

      now.set(`${session.id}:${agent.id}`, {
        status: String(agent.status ?? ''),
        activity: String(agent.activity ?? ''),
        name: String(agent.name || agent.type || anAgent),
        session: label,
      })
    }
  }

  if (before) {
    for (const [key, agent] of now) {
      const was = before.get(key)
      const isBoss = key.endsWith(':boss')
      const isWaiting = isBoss ? agent.status === 'waiting' : agent.status === 'running' && agent.activity === 'waiting'
      const wasWaiting = was ? (isBoss ? was.status === 'waiting' : was.status === 'running' && was.activity === 'waiting') : false

      if (isWaiting && !wasWaiting) {
        notes.push({ title: say('waiting', agent.name), body: agent.session })
      } else if (!isBoss && was && agent.status !== was.status && agent.status === 'done') {
        notes.push({ title: say('done', agent.name), body: agent.session })
      } else if (!isBoss && was && agent.status !== was.status && agent.status === 'failed') {
        notes.push({ title: say('failed', agent.name), body: agent.session })
      }
    }
  }

  return { seen: now, notes }
}
