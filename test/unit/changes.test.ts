import { describe, expect, test } from 'vitest'

import { changesOf } from '../../electron/changes'
import type { LiveSession } from '../../electron/shared'

const NOW = Date.now()

const session = (agents: Record<string, unknown>[], id = 's1'): LiveSession => ({ id, label: 'repo', agents, boss: { status: 'working' }, usage: null })

const agent = (id: string, over: Record<string, unknown> = {}) => ({ id, name: id, status: 'running', activity: 'working', ...over })

describe('what becomes a notification', () => {
  test('an agent that started and ended between two looks is still announced once', () => {
    const first = changesOf(null, [session([])])
    const quick = changesOf(first.seen, [session([agent('quick', { status: 'done', endedAt: NOW - 2000 })])])

    expect(quick.notes.map(note => note.title)).toEqual(['quick terminó'])

    // Seen again at the next look: not said twice.
    expect(changesOf(quick.seen, [session([agent('quick', { status: 'done', endedAt: NOW - 2000 })])]).notes).toEqual([])
  })

  test('failed likewise; old finished agents and unseen sessions stay quiet', () => {
    const first = changesOf(null, [session([])])

    expect(changesOf(first.seen, [session([agent('bad', { status: 'failed', endedAt: NOW - 1000 })])]).notes.map(note => note.title)).toEqual(['bad falló'])
    // Finished long ago (a mod that reloaded and lists them again): no news.
    expect(changesOf(first.seen, [session([agent('old', { status: 'done', endedAt: NOW - 10 * 60_000 })])]).notes).toEqual([])
    // A session first seen with finished agents (the app just opened): no flood.
    expect(changesOf(first.seen, [session([agent('x', { status: 'done', endedAt: NOW - 1000 })], 'brand-new')]).notes).toEqual([])
  })
})
