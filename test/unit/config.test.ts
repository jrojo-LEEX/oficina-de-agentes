import * as fs from 'node:fs'
import * as path from 'node:path'

import { describe, expect, test } from 'vitest'

import { CONFIG_VERSION, carryOver, DEFAULTS, loadConfig, loadConfigFile, parseConfig, saveConfig, serializeConfig } from '../../electron/config'
import { tempDir } from './helpers'

describe('the config', () => {
  test('nothing stored: every default, the whip off', () => {
    const config = parseConfig('{}')

    expect(config).toEqual({ ...DEFAULTS })
    expect(config.isWhipOn).toBe(false)
    expect(config.clientFolders).toEqual([])
  })

  test('a byte-order mark at the start does not throw the values away', () => {
    const text = `\uFEFF${JSON.stringify({ configVersion: CONFIG_VERSION, officeCorner: 'tl', volume: 0.3, isWhipOn: true })}`
    const config = parseConfig(text)

    expect(config.officeCorner).toBe('tl')
    expect(config.volume).toBe(0.3)
    expect(config.isWhipOn).toBe(true)
  })

  test('a file with a byte-order mark on disk loads its values too', () => {
    const file = path.join(tempDir(), 'config.json')
    fs.writeFileSync(file, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(JSON.stringify({ configVersion: 2, officeSize: 'l' }))]))

    expect(loadConfig(file).officeSize).toBe('l')
  })

  test('the file is written without a byte-order mark, and reads back the same', () => {
    const file = path.join(tempDir(), 'nested', 'config.json')
    const config = { ...parseConfig('{}'), officeTheme: 'night' as const, clientFolders: ['clients'] }
    saveConfig(file, config)
    const bytes = fs.readFileSync(file)

    expect([...bytes.subarray(0, 3)]).not.toEqual([0xef, 0xbb, 0xbf])
    expect(bytes.toString('utf8')).toBe(serializeConfig(config))
    expect(loadConfig(file)).toEqual(config)
    // Nothing left aside.
    expect(fs.readdirSync(path.dirname(file))).toEqual(['config.json'])
  })

  test('one bad value falls back alone; unknown fields are dropped', () => {
    const config = parseConfig(
      JSON.stringify({ configVersion: 2, officeCorner: 'middle', volume: 7, isMuted: 'yes', officeSize: 's', shortcuts: { interactive: '' }, future: 1 }),
    )

    expect(config.officeCorner).toBe(DEFAULTS.officeCorner)
    expect(config.volume).toBe(DEFAULTS.volume)
    expect(config.isMuted).toBe(DEFAULTS.isMuted)
    expect(config.officeSize).toBe('s')
    expect(config.shortcuts).toEqual(DEFAULTS.shortcuts)
    expect('future' in config).toBe(false)
  })

  test('client folders keep only plain folder names', () => {
    const config = parseConfig(JSON.stringify({ configVersion: 2, clientFolders: ['clients', '..\\..\\Windows', 42, 'clientes'] }))

    expect(config.clientFolders).toEqual(['clients', 'clientes'])
  })

  test('not JSON, or not an object: the defaults', () => {
    expect(parseConfig('{ broken')).toEqual({ ...DEFAULTS })
    expect(parseConfig('[1, 2]')).toEqual({ ...DEFAULTS })
    expect(loadConfig(path.join(tempDir(), 'missing.json'))).toEqual({ ...DEFAULTS })
  })

  test('a version 1 config (the whip-first app) keeps the whip and the client folders it had', () => {
    const config = parseConfig(JSON.stringify({ officeCorner: 'bl', whipProfile: 'long' }))

    expect(config.configVersion).toBe(CONFIG_VERSION)
    expect(config.isWhipOn).toBe(true)
    expect(config.clientFolders).toEqual(['clients', 'clientes'])
    expect(config.officeCorner).toBe('bl')
    expect(config.whipProfile).toBe('long')
  })

  test('a version 1 config that already chose keeps its choice', () => {
    const config = parseConfig(JSON.stringify({ isWhipOn: false, clientFolders: [] }))

    expect(config.isWhipOn).toBe(false)
    expect(config.clientFolders).toEqual([])
  })

  test('a hand-written file without configVersion is read as this version, not the old app', () => {
    const config = parseConfig(JSON.stringify({ language: 'en', officeCorner: 'tl' }))

    expect(config.isWhipOn).toBe(false)
    expect(config.clientFolders).toEqual([])
    expect(config.language).toBe('en')
  })

  test('a file that is not JSON is kept aside, and the defaults take its place without touching it', () => {
    const dir = tempDir()
    const file = path.join(dir, 'config.json')
    const edited = '{ "shortcuts": { "interactive": "Alt+Shift+O" }, }'
    fs.writeFileSync(file, edited)
    const { config, brokenCopy } = loadConfigFile(file, Date.UTC(2026, 9, 9, 12))

    expect(config).toEqual({ ...DEFAULTS })
    expect(brokenCopy).toBe(`${file}.broken-2026-10-09T12-00-00-000Z`)
    expect(fs.readFileSync(brokenCopy!, 'utf8')).toBe(edited)
    expect(loadConfigFile(path.join(dir, 'missing.json')).brokenCopy).toBeNull()
  })

  test('the first run after the rename copies the old config and ledger, and never overwrites', () => {
    const from = tempDir('old')
    const to = path.join(tempDir('new'), 'oficina-de-agentes')
    fs.writeFileSync(path.join(from, 'config.json'), '{"officeSize":"l"}')
    fs.writeFileSync(path.join(from, 'ledger.json'), '{}')

    expect(carryOver(from, to).sort()).toEqual(['config.json', 'ledger.json'])
    expect(loadConfig(path.join(to, 'config.json')).officeSize).toBe('l')

    fs.writeFileSync(path.join(from, 'config.json'), '{"officeSize":"s"}')
    expect(carryOver(from, to)).toEqual([])
    expect(loadConfig(path.join(to, 'config.json')).officeSize).toBe('l')
    // The old folder is left as it was.
    expect(fs.existsSync(path.join(from, 'ledger.json'))).toBe(true)
  })

  test('nothing to carry over: nothing happens', () => {
    const to = path.join(tempDir('new'), 'app')

    expect(carryOver(path.join(tempDir('old'), 'missing'), to)).toEqual([])
    expect(fs.existsSync(to)).toBe(false)
  })
})
