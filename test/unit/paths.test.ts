import * as path from 'node:path'

import { describe, expect, test } from 'vitest'

import { claudeDirOf, isAbsoluteLocal, isInside, liveDirOf, transcriptsDirOf, userDataDirOf } from '../../electron/paths'

const HOME = path.resolve('/home/ana')

describe('where Claude Code keeps its folder', () => {
  test('without CLAUDE_CONFIG_DIR it is ~/.claude', () => {
    expect(claudeDirOf({}, HOME)).toBe(path.join(HOME, '.claude'))
    expect(liveDirOf({}, HOME)).toBe(path.join(HOME, '.claude', 'oficina-live'))
    expect(transcriptsDirOf({}, HOME)).toBe(path.join(HOME, '.claude', 'projects'))
  })

  test('CLAUDE_CONFIG_DIR moves everything with it', () => {
    const env = { CLAUDE_CONFIG_DIR: path.resolve('/data/claude') }

    expect(claudeDirOf(env, HOME)).toBe(path.resolve('/data/claude'))
    expect(liveDirOf(env, HOME)).toBe(path.join(path.resolve('/data/claude'), 'oficina-live'))
    expect(transcriptsDirOf(env, HOME)).toBe(path.join(path.resolve('/data/claude'), 'projects'))
  })

  test('only an absolute local path counts, as for the mod: blank, ~, relative and network paths are unset', () => {
    const fallback = path.join(HOME, '.claude')

    for (const value of ['', '   ', '~', '~/otra', 'otra', String.raw`.\otra`, String.raw`\\server\share`, '//server/share']) {
      expect(claudeDirOf({ CLAUDE_CONFIG_DIR: value }, HOME), value).toBe(fallback)
    }

    expect(isAbsoluteLocal(String.raw`C:\data`)).toBe(true)
    expect(isAbsoluteLocal('D:/data')).toBe(true)
    expect(isAbsoluteLocal('/data')).toBe(true)
  })

  test('OFICINA_LIVE_DIR and OFICINA_USER_DATA_DIR point the app elsewhere', () => {
    const env = { CLAUDE_CONFIG_DIR: path.resolve('/data/claude'), OFICINA_LIVE_DIR: path.resolve('/tmp/live'), OFICINA_USER_DATA_DIR: path.resolve('/tmp/app') }

    expect(liveDirOf(env, HOME)).toBe(path.resolve('/tmp/live'))
    expect(userDataDirOf(path.resolve('/roaming'), env)).toBe(path.resolve('/tmp/app'))
    expect(userDataDirOf(path.resolve('/roaming'), {})).toBe(path.join(path.resolve('/roaming'), 'oficina-de-agentes'))
  })

  test('a path is kept inside its folder', () => {
    const dir = path.resolve('/data/live')

    expect(isInside(dir, path.join(dir, 'a.json'))).toBe(true)
    expect(isInside(dir, dir)).toBe(true)
    expect(isInside(dir, path.join(dir, '..', 'secret.json'))).toBe(false)
    expect(isInside(dir, path.resolve('/data/live-other/a.json'))).toBe(false)
  })
})
