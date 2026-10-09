import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { test } from 'node:test'

import { emptyLedger, IDLE_GAP_MS, projectOf, scan, summaryOf } from '../electron/ledger.ts'
import { freshOf, spendOf } from '../src/spend.ts'
import type { SpendSession } from '../src/spend.ts'

const SESSION = '11111111-2222-3333-4444-555555555555'
const T0 = Date.parse('2026-10-06T12:00:00Z')

const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString()

const answer = (minutes: number, id: string, usage: Record<string, number>, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ type: 'assistant', timestamp: at(minutes), sessionId: SESSION, cwd: 'C:\\code\\tienda', message: { id, model: 'claude-opus-5-5', usage }, ...extra })

const said = (minutes: number) => JSON.stringify({ type: 'user', timestamp: at(minutes), sessionId: SESSION, cwd: 'C:\\code\\tienda' })

/** A projects folder with one session's transcript and one subagent's, as Claude Code lays them out. */
const projects = (main: string[], sub: string[] = []) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-'))
  const dir = path.join(root, 'C--code-tienda')
  fs.mkdirSync(path.join(dir, SESSION, 'subagents'), { recursive: true })
  fs.writeFileSync(path.join(dir, `${SESSION}.jsonl`), main.join('\n') + '\n')

  if (sub.length) fs.writeFileSync(path.join(dir, SESSION, 'subagents', 'agent-a1.jsonl'), sub.join('\n') + '\n')

  return { root, file: path.join(dir, `${SESSION}.jsonl`) }
}

const usage = { input_tokens: 10, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000, output_tokens: 50 }

test('an answer written over several lines counts once; active time skips long pauses', async () => {
  const { root } = projects([
    said(0),
    answer(1, 'msg_1', usage),
    answer(1, 'msg_1', usage),
    answer(1, 'msg_1', usage),
    said(3),
    answer(4, 'msg_2', usage),
    // A long lunch: not work.
    said(60),
    answer(61, 'msg_3', usage),
    JSON.stringify({ type: 'custom-title', customTitle: 'Arreglar el carrito', sessionId: SESSION }),
  ])
  const ledger = emptyLedger()
  await scan(ledger, root)
  const entry = ledger.sessions[SESSION]!
  const day = Object.values(entry.days)[0]!

  assert.equal(day.replies, 3)
  assert.equal(day.output, 150)
  assert.equal(day.cacheRead, 3000)
  // 0→1→3→4 is four minutes of work; 4→60 is a pause; 60→61 is one more.
  assert.equal(day.activeMs, 5 * 60_000)
  assert.ok(IDLE_GAP_MS < 56 * 60_000)
  assert.equal(entry.title, 'Arreglar el carrito')
  assert.equal(entry.project, 'tienda')
})

test("a subagent's tokens count for its session, its time does not double", async () => {
  const { root } = projects(
    [said(0), answer(2, 'msg_1', usage)],
    [JSON.stringify({ type: 'user', timestamp: at(0.5), sessionId: SESSION, isSidechain: true }), answer(1, 'msg_sub', usage, { isSidechain: true })],
  )
  const ledger = emptyLedger()
  await scan(ledger, root)
  const day = Object.values(ledger.sessions[SESSION]!.days)[0]!

  assert.equal(day.replies, 2)
  assert.equal(day.activeMs, 2 * 60_000)
})

test('a second scan reads only what the transcript grew by; a half-written line waits', async () => {
  const { root, file } = projects([said(0), answer(1, 'msg_1', usage)])
  const ledger = emptyLedger()
  await scan(ledger, root)

  assert.equal(await scan(ledger, root), false, 'nothing new, nothing read')

  fs.appendFileSync(file, answer(2, 'msg_2', usage) + '\n' + answer(3, 'msg_3', usage).slice(0, 40))
  await scan(ledger, root)
  assert.equal(Object.values(ledger.sessions[SESSION]!.days)[0]!.replies, 2)

  fs.appendFileSync(file, answer(3, 'msg_3', usage).slice(40) + '\n')
  await scan(ledger, root)
  assert.equal(Object.values(ledger.sessions[SESSION]!.days)[0]!.replies, 3)
})

test('worktrees count as their repository, scratch folders by their date', () => {
  assert.equal(projectOf('C:\\code\\tienda\\.claude\\worktrees\\feliz-turing').name, 'tienda')
  assert.equal(projectOf('C:\\Users\\a\\AppData\\Roaming\\Claude\\scratch-workspaces\\x\\y\\scratch-2026-10-02-830126').name, 'Sin carpeta · 02/10')
})

test('periods: today, a week, everything; projects add their sessions up', () => {
  const now = Date.parse('2026-10-06T15:00:00')
  const bucket = (output: number) => ({ activeMs: 60_000, input: 1, cacheWrite: 1, cacheRead: 100, output, replies: 1 })
  const sessions: SpendSession[] = [
    { id: 'a', project: 'tienda', projectPath: 'C:/code/tienda', title: 'hoy', firstAt: now, lastAt: now, days: { '2026-10-06': bucket(10) }, usd: 1.5, models: {} },
    { id: 'b', project: 'tienda', projectPath: 'C:/code/tienda', title: 'ayer', firstAt: now, lastAt: now - 86_400_000, days: { '2026-10-05': bucket(20) }, usd: 0, models: {} },
    { id: 'c', project: 'blog', projectPath: 'C:/code/blog', title: 'viejo', firstAt: now, lastAt: now - 40 * 86_400_000, days: { '2026-08-20': bucket(30) }, usd: 0, models: {} },
  ]

  assert.equal(spendOf(sessions, 'today', now).total.sessions, 1)
  const week = spendOf(sessions, 'week', now)
  assert.equal(week.total.sessions, 2)
  assert.deepEqual(week.projects.map(row => [row.name, row.sessions, row.output]), [['tienda', 2, 30]])
  assert.equal(week.total.usd, 1.5)
  assert.equal(spendOf(sessions, 'all', now).projects.length, 2)
  assert.equal(freshOf(week.total), 34)
})

test('the summary sent to the screen leaves the bookkeeping out', async () => {
  const { root } = projects([said(0), answer(1, 'msg_1', usage)])
  const ledger = emptyLedger()
  await scan(ledger, root)
  const [one] = summaryOf(ledger)

  assert.ok(one)
  assert.equal('recentIds' in one, false)
})

test('the client comes from a clients folder in the path; models get their family names', async () => {
  const { clientOf, modelName } = await import('../src/spend.ts')

  const folders = ['clients', 'clientes']
  assert.equal(clientOf({ cwd: String.raw`C:\agencia\clients\globex\qa`, projectPath: String.raw`C:\agencia` }, folders), 'globex')
  assert.equal(clientOf({ cwd: 'C:/agencia/clientes/acme', projectPath: 'C:/agencia' }, folders), 'acme')
  // No folders configured: no clients at all.
  assert.equal(clientOf({ cwd: 'C:/agencia/clientes/acme', projectPath: 'C:/agencia' }, []), null)
  assert.equal(clientOf({ cwd: String.raw`C:\code\tienda`, projectPath: String.raw`C:\code\tienda` }, folders), null)
  assert.equal(modelName('claude-opus-5-5'), 'Opus 5.5')
  assert.equal(modelName('claude-haiku-4-5-20251001'), 'Haiku 4.5')
  assert.equal(modelName('claude-sonnet-5'), 'Sonnet 5')
})

test('the ledger keeps time per hour and tokens per model; the panel adds them up', async () => {
  const { dailyOf, hoursOf, spendOf } = await import('../src/spend.ts')
  const { root } = projects([said(0), answer(1, 'msg_1', usage), said(3), answer(4, 'msg_2', usage, { message: { id: 'msg_2', model: 'claude-haiku-4-5', usage } })])
  const ledger = emptyLedger()
  await scan(ledger, root)
  const sessions = summaryOf(ledger) as never as SpendSession[]
  const now = T0 + 3600_000

  const models = spendOf(sessions, 'all', now).models
  assert.deepEqual(models.map(row => [row.name, row.replies]).sort(), [['Haiku 4.5', 1], ['Opus 5.5', 1]])

  const grid = hoursOf(sessions, 'all', now)
  assert.equal(grid.flat().reduce((sum, ms) => sum + ms, 0), 4 * 60_000)

  const days = dailyOf(sessions, now, 7)
  assert.equal(days.length, 7)
  assert.equal(days[6]!.activeMs, 4 * 60_000)
})

test('limits from several sessions: the latest window, its highest use; a window already reset is dropped', async () => {
  const { mergeLimits } = await import('../src/spend.ts')
  const now = Date.parse('2026-10-06T15:30:00Z')
  const five = (percentUsed: number, resetsAt = '2026-10-06T17:00:00Z') => ({ kind: 'five_hour', percentUsed, resetsAt })
  const week = (percentUsed: number) => ({ kind: 'seven_day', percentUsed, resetsAt: '2026-10-09T10:00:00Z' })

  // Three sessions, each as of its own last answer: 58, 90 and 74 of the same window.
  const merged = mergeLimits([week(64), five(58), week(70), five(90), five(74), week(67)], now)
  assert.deepEqual(merged.map(one => [one.kind, one.percentUsed]), [['five_hour', 90], ['seven_day', 70]])

  // The order the sessions come in does not change the answer.
  assert.deepEqual(mergeLimits([five(74), five(90), five(58)], now)[0]!.percentUsed, 90)

  // A new window beats a fuller old one; a window already over counts for nothing.
  assert.equal(mergeLimits([five(95, '2026-10-06T17:00:00Z'), five(5, '2026-10-06T22:00:00Z')], now)[0]!.percentUsed, 5)
  assert.deepEqual(mergeLimits([five(95, '2026-10-06T12:00:00Z')], now), [])
})
