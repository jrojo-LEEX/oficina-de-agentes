import * as fs from 'node:fs'
import * as path from 'node:path'

import { describe, expect, test } from 'vitest'

import { readLive } from '../../electron/live'
import { compareVersions, isOldMod, parseSnapshot } from '../../electron/snapshot'
import { agentOf, NOW, snapshotOf } from './fixtures'
import { tempDir, writeJson } from './helpers'

describe('the live snapshot', () => {
  test('a snapshot as the mod writes it comes through whole', () => {
    const snapshot = snapshotOf('s1')

    expect(parseSnapshot(JSON.stringify(snapshot))).toEqual(snapshot)
  })

  test('fields it does not know are ignored, not a reason to drop it', () => {
    const parsed = parseSnapshot(JSON.stringify({ ...snapshotOf('s1'), future: { x: 1 }, agents: [{ ...agentOf('a1'), mood: 'happy' }] }))

    expect(parsed?.session).toBe('s1')
    expect(parsed?.agents).toHaveLength(1)
    expect('mood' in parsed!.agents[0]!).toBe(false)
  })

  test('an agent that does not fit is dropped alone; bad fields fall back', () => {
    const parsed = parseSnapshot(
      JSON.stringify({
        ...snapshotOf('s1'),
        agents: [agentOf('good'), { name: 'no id' }, 'text', { ...agentOf('odd'), status: 'dancing', tools: -3, files: 'nope' }],
      }),
    )

    expect(parsed?.agents.map(agent => agent.id)).toEqual(['good', 'odd'])
    expect(parsed?.agents[1]?.status).toBe('unknown')
    expect(parsed?.agents[1]?.tools).toBe(0)
    expect(parsed?.agents[1]?.files).toEqual([])
  })

  test('without a session or a list of agents it is not a snapshot', () => {
    expect(parseSnapshot('{ half written')).toBeNull()
    expect(parseSnapshot(JSON.stringify({ agents: [] }))).toBeNull()
    expect(parseSnapshot(JSON.stringify({ session: 's1' }))).toBeNull()
    expect(parseSnapshot('null')).toBeNull()
  })

  test('long texts are cut, so a runaway file cannot flood the screen', () => {
    const parsed = parseSnapshot(JSON.stringify(snapshotOf('s1', { agents: [agentOf('a1', { detail: 'x'.repeat(5000) })] })))

    expect(parsed?.agents[0]?.detail.length).toBe(200)
  })

  test('a snapshot from a mod before schemaVersion reads as version 0, and as an old mod', () => {
    const { schemaVersion: _version, modVersion: _mod, ...legacy } = snapshotOf('s1')
    const parsed = parseSnapshot(JSON.stringify(legacy))

    expect(parsed?.schemaVersion).toBe(0)
    expect(parsed?.agents).toHaveLength(1)
    expect(isOldMod(parsed!)).toBe(true)
    expect(isOldMod(snapshotOf('s2'))).toBe(false)
    expect(isOldMod({ schemaVersion: 1, modVersion: '0.9.3' })).toBe(true)
    expect(isOldMod({ schemaVersion: 1, modVersion: 'unknown' })).toBe(false)
  })

  test('versions compare part by part', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.2.0', '1.10.0')).toBe(-1)
    expect(compareVersions('2.0', '1.9.9')).toBe(1)
    expect(compareVersions('1.0.1-beta', '1.0.0')).toBe(1)
  })
})

describe('reading the live folder', () => {
  test('fresh sessions are read; stale, ended and broken ones are not; dead ones are swept', () => {
    const dir = tempDir('live')
    writeJson(path.join(dir, 'b.json'), snapshotOf('b'))
    writeJson(path.join(dir, 'a.json'), snapshotOf('a', { updatedAt: NOW - 1000 }))
    writeJson(path.join(dir, 'stale.json'), snapshotOf('stale', { updatedAt: NOW - 60_000 }))
    writeJson(path.join(dir, 'ended.json'), snapshotOf('ended', { isEnded: true }))
    writeJson(path.join(dir, 'dead.json'), snapshotOf('dead', { updatedAt: NOW - 2 * 24 * 60 * 60 * 1000 }))
    fs.writeFileSync(path.join(dir, 'broken.json'), '{ "session": "x", "agen')
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'not a snapshot')

    const sessions = readLive(dir, NOW)

    expect(sessions.map(session => session.id)).toEqual(['a', 'b'])
    expect(sessions[0]?.agents).toHaveLength(1)
    expect(fs.existsSync(path.join(dir, 'dead.json'))).toBe(false)
    expect(fs.existsSync(path.join(dir, 'broken.json'))).toBe(true)
  })

  test('files that are not snapshots are never swept, however old', () => {
    const dir = tempDir('live')
    const old = new Date(NOW - 3 * 24 * 60 * 60 * 1000)
    fs.writeFileSync(path.join(dir, 'settings.json'), '{"theme":"dark"}')
    fs.writeFileSync(path.join(dir, 'broken.json'), '{ "session":')
    fs.utimesSync(path.join(dir, 'settings.json'), old, old)
    fs.utimesSync(path.join(dir, 'broken.json'), old, old)

    expect(readLive(dir, NOW)).toEqual([])
    expect(fs.readdirSync(dir).sort()).toEqual(['broken.json', 'settings.json'])
  })

  test('no folder yet: no sessions, no error', () => {
    expect(readLive(path.join(tempDir(), 'missing'), NOW)).toEqual([])
  })
})
