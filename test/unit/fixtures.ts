// Snapshots as the mod writes them, for the tests.

import type { OficinaAgent, OficinaSnapshot } from '../../plugin/oficina/types/snapshot'

export const NOW = Date.now()

export const agentOf = (id: string, over: Partial<OficinaAgent> = {}): OficinaAgent => ({
  id,
  seq: 0,
  name: id,
  type: 'Explore',
  kind: 'subagent',
  status: 'running',
  activity: 'reading',
  detail: 'Read app.ts',
  tools: 1,
  startedAt: NOW - 60_000,
  endedAt: 0,
  seenAt: NOW,
  isListed: true,
  isBackground: false,
  isDemo: false,
  note: '',
  files: [{ path: 'C:/repo/app.ts', isWrite: false, at: NOW }],
  trail: ['ok'],
  ...over,
})

export const snapshotOf = (session: string, over: Partial<OficinaSnapshot> = {}): OficinaSnapshot => ({
  schemaVersion: 1,
  modVersion: '1.0.0',
  session,
  label: 'repo',
  cwd: 'C:/repo',
  updatedAt: NOW,
  isEnded: false,
  agents: [agentOf('a1')],
  boss: { status: 'working', activity: 'working', detail: '', since: NOW, files: [], trail: [] },
  usage: { tokens: 1000, window: 200_000, percent: 1, usd: 0.5, limits: [] },
  ...over,
})

