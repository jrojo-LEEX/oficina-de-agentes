import * as fs from 'node:fs'
import * as path from 'node:path'

import { describe, expect, test } from 'vitest'

import { emptyLedger, loadLedger, saveLedger, scan, summaryOf } from '../../electron/ledger'
import { tempDir } from './helpers'

const SECRET = 'the-password-is-hunter2'
const SESSION = '11111111-2222-3333-4444-555555555555'

/** A transcript whose lines carry things that must never reach the ledger. */
const transcript = (root: string) => {
  const dir = path.join(root, 'C--work-repo')
  fs.mkdirSync(dir, { recursive: true })
  const at = (s: number) => new Date(Date.UTC(2026, 9, 9, 12, 0, s)).toISOString()
  const lines = [
    { type: 'user', sessionId: SESSION, cwd: 'C:/work/repo', timestamp: at(0), message: { role: 'user', content: `please use ${SECRET}` } },
    {
      type: 'assistant',
      sessionId: SESSION,
      cwd: 'C:/work/repo',
      timestamp: at(30),
      message: {
        id: 'msg_1',
        model: 'claude-opus-5-5',
        content: [{ type: 'text', text: `ok, ${SECRET}` }, { type: 'tool_use', input: { command: `echo ${SECRET}` } }],
        usage: { input_tokens: 10, cache_creation_input_tokens: 5, cache_read_input_tokens: 100, output_tokens: 20 },
      },
    },
    { type: 'assistant', sessionId: SESSION, timestamp: at(40), message: { id: 'msg_2', usage: { input_tokens: 'lots', output_tokens: 3 } } },
    { type: 'custom-title', sessionId: SESSION, customTitle: 'Fix the login', timestamp: at(41) },
  ]
  fs.writeFileSync(path.join(dir, `${SESSION}.jsonl`), `${lines.map(line => JSON.stringify(line)).join('\n')}\n`)
}

describe('the spending ledger', () => {
  test('keeps numbers, titles and folders, never what was said', async () => {
    const root = tempDir('projects')
    transcript(root)
    const ledger = emptyLedger()
    await scan(ledger, root)
    const stored = JSON.stringify(ledger)

    expect(stored).not.toContain(SECRET)
    expect(stored).not.toContain('please use')
    const [session] = summaryOf(ledger)
    expect(session?.title).toBe('Fix the login')
    expect(session?.project).toBe('repo')
    const day = Object.values(session!.days)[0]!
    // A field of the wrong kind counts as zero, not as a broken line.
    expect(day.input).toBe(10)
    expect(day.output).toBe(23)
    expect(day.cacheRead).toBe(100)
    expect(day.replies).toBe(2)
  })

  test('a damaged ledger is thrown away and rebuilt from the transcripts', async () => {
    const root = tempDir('projects')
    transcript(root)
    const file = path.join(tempDir('app'), 'ledger.json')
    const ledger = emptyLedger()
    await scan(ledger, root)
    saveLedger(file, ledger)

    expect(loadLedger(file).sessions[SESSION]).toBeDefined()

    const damaged = JSON.parse(fs.readFileSync(file, 'utf8'))
    damaged.sessions[SESSION].days = 'oops'
    fs.writeFileSync(file, JSON.stringify(damaged))
    const fresh = loadLedger(file)

    expect(fresh).toEqual(emptyLedger())
    await scan(fresh, root)
    expect(summaryOf(fresh)).toEqual(summaryOf(ledger))
  })

  test('a hostile session id or model name never reaches Object.prototype, and the scan goes on', async () => {
    const root = tempDir('projects')
    transcript(root)
    const dir = path.join(root, 'C--work-evil')
    fs.mkdirSync(dir, { recursive: true })
    const at = new Date(Date.UTC(2026, 9, 9, 13)).toISOString()
    const usage = { input_tokens: 1, output_tokens: 1 }
    fs.writeFileSync(
      path.join(dir, '__proto__.jsonl'),
      [
        { type: 'user', cwd: 'C:/evil', timestamp: at },
        { type: 'assistant', timestamp: at, message: { id: 'x1', usage } },
        { type: 'assistant', sessionId: 'constructor', timestamp: at, message: { id: 'x2', usage } },
        { type: 'assistant', sessionId: SESSION, timestamp: at, message: { id: 'x3', model: '__proto__', usage } },
      ]
        .map(line => JSON.stringify(line))
        .join('\n') + '\n',
    )
    const ledger = emptyLedger()
    await scan(ledger, root)

    expect(({} as Record<string, unknown>).project).toBeUndefined()
    expect(({} as Record<string, unknown>).replies).toBeUndefined()
    expect(Object.keys(ledger.sessions)).toEqual([SESSION])
    // Its good lines still count, the hostile model is just not named.
    expect(Object.values(ledger.sessions[SESSION]!.days)[0]!.replies).toBe(3)
    expect(Object.keys(ledger.sessions[SESSION]!.models)).toEqual(['claude-opus-5-5'])
  })

  test('a stored ledger with a hostile key is rebuilt', () => {
    const file = path.join(tempDir('app'), 'ledger.json')
    fs.writeFileSync(file, '{"version":4,"files":{},"sessions":{"__proto__":{"id":"x"}}}')

    expect(loadLedger(file)).toEqual(emptyLedger())
  })

  test('a missing or unreadable ledger starts empty', () => {
    const dir = tempDir('app')
    fs.writeFileSync(path.join(dir, 'ledger.json'), 'not json')

    expect(loadLedger(path.join(dir, 'ledger.json'))).toEqual(emptyLedger())
    expect(loadLedger(path.join(dir, 'missing.json'))).toEqual(emptyLedger())
  })
})
