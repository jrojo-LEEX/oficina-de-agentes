import * as path from 'node:path'

import { describe, expect, test } from 'vitest'

import { claudeDirOf, liveDirOf } from '../../electron/paths'
import { setupStatus } from '../../electron/setup'
import { NOW, snapshotOf } from './fixtures'
import { tempDir, writeJson } from './helpers'

describe('the first-run checks', () => {
  test('no Claude Code folder: said so, and no mod', () => {
    const claude = path.join(tempDir(), '.claude')
    const status = setupStatus(claude, path.join(claude, 'oficina-live'), NOW, {})

    expect(status.hasClaude).toBe(false)
    expect(status.modSource).toBeNull()
    expect(status.liveSessions).toBe(0)
  })

  test('installed from the marketplace, with its version', () => {
    const claude = tempDir('claude')
    writeJson(path.join(claude, 'plugins', 'installed_plugins.json'), {
      version: 2,
      plugins: { 'oficina@oficina-de-agentes': [{ scope: 'user', version: '1.0.0' }], 'other@x': [{ version: '9' }] },
    })
    const status = setupStatus(claude, path.join(claude, 'oficina-live'), NOW, {})

    expect(status.hasClaude).toBe(true)
    expect(status.modSource).toBe('marketplace')
    expect(status.modVersion).toBe('1.0.0')
    expect(status.isModDisabled).toBe(false)
  })

  test('installed but turned off in the settings', () => {
    const claude = tempDir('claude')
    writeJson(path.join(claude, 'plugins', 'installed_plugins.json'), { plugins: { 'oficina@oficina-de-agentes': [{ version: '1.0.0' }] } })
    writeJson(path.join(claude, 'settings.json'), { enabledPlugins: { 'oficina@oficina-de-agentes': false } })

    expect(setupStatus(claude, path.join(claude, 'oficina-live'), NOW, {}).isModDisabled).toBe(true)
  })

  test('loaded from a folder named in the settings (CLAUDE_CODE_PLUGIN_DIRS)', () => {
    const claude = tempDir('claude')
    const mod = tempDir('mod')
    writeJson(path.join(mod, '.claude-plugin', 'plugin.json'), { name: 'oficina', version: '1.0.0' })
    writeJson(path.join(claude, 'settings.json'), { env: { CLAUDE_CODE_PLUGIN_DIRS: mod } })
    const status = setupStatus(claude, path.join(claude, 'oficina-live'), NOW, {})

    expect(status.modSource).toBe('folder')
    expect(status.modVersion).toBe('1.0.0')
  })

  test('seen writing, and out of date', () => {
    const claude = tempDir('claude')
    const live = path.join(claude, 'oficina-live')
    const { schemaVersion: _version, modVersion: _mod, ...legacy } = snapshotOf('s1', { updatedAt: NOW })
    writeJson(path.join(live, 's1.json'), legacy)
    const status = setupStatus(claude, live, NOW, {})

    expect(status.modSource).toBe('seen')
    expect(status.isModOld).toBe(true)
    expect(status.liveSessions).toBe(1)
  })

  test('with CLAUDE_CONFIG_DIR every check looks in that folder', () => {
    const custom = tempDir('custom-claude')
    const env = { CLAUDE_CONFIG_DIR: custom }
    writeJson(path.join(custom, 'plugins', 'installed_plugins.json'), { plugins: { 'oficina@oficina-de-agentes': [{ version: '1.0.0' }] } })
    writeJson(path.join(custom, 'oficina-live', 's1.json'), snapshotOf('s1', { updatedAt: NOW }))
    const status = setupStatus(claudeDirOf(env), liveDirOf(env), NOW, env)

    expect(status.claudeDir).toBe(path.resolve(custom))
    expect(status.modSource).toBe('marketplace')
    expect(status.liveSessions).toBe(1)
  })
})
