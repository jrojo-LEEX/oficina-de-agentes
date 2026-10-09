import { expect, test } from 'claude-code/testing'

import {
  activityOf,
  detailOf,
  pruned,
  reconciled,
  started,
  stopped,
  tally,
  toolBegan,
  toolEnded,
  turnEnded,
  waiting,
} from '../hooks/agents.ts'
import { DEMO_STEPS, demoStep } from '../hooks/demo.ts'

const one = (list: ReturnType<typeof started>, id: string) => list.find(agent => agent.id === id)!

test('a spawn seats a running agent with its real name and type', async () => {
  const list = started([], { id: 'a', name: 'Buscar usos', type: 'Explore', isBackground: true }, 1000)

  expect(one(list, 'a')).toMatchObject({
    name: 'Buscar usos',
    type: 'Explore',
    status: 'running',
    activity: 'working',
    startedAt: 1000,
    isBackground: true,
    seq: 0,
  })
})

test('a background agent that was only launched is not finished', async () => {
  const list = started([], { id: 'a', type: 'general-purpose', isBackground: true }, 1000)

  expect(one(list, 'a').status).toBe('running')
  expect(tally(list)).toMatchObject({ active: 1, done: 0 })
})

test('a tool call is pinned on the agent whose loop made it, and only on it', async () => {
  let list = started([], { id: 'a', type: 'Explore' }, 0)
  list = started(list, { id: 'b', type: 'Plan' }, 0)
  list = toolBegan(list, 'a', 'Read', detailOf('Read', { file_path: 'C:\\repo\\src\\app.ts' }), 5)

  expect(one(list, 'a')).toMatchObject({ activity: 'reading', detail: 'Read app.ts', tools: 1 })
  expect(one(list, 'b')).toMatchObject({ activity: 'working', detail: '', tools: 0 })

  list = toolEnded(list, 'a')
  expect(one(list, 'a')).toMatchObject({ activity: 'working', detail: '', tools: 0 })
})

test('activities follow the kind of tool', async () => {
  expect(activityOf('Read')).toBe('reading')
  expect(activityOf('Grep')).toBe('searching')
  expect(activityOf('Edit')).toBe('editing')
  expect(activityOf('Bash')).toBe('tool')
  expect(detailOf('Grep', { pattern: 'TODO' })).toBe('Grep TODO')
  expect(detailOf('Bash', { command: 'npm test -- --watch' })).toBe('Bash npm')
})

test('a failed tool does not fail the agent', async () => {
  let list = started([], { id: 'a', type: 'Explore' }, 0)
  list = toolBegan(list, 'a', 'Bash', 'Bash npm', 1)
  list = toolEnded(list, 'a')

  expect(one(list, 'a').status).toBe('running')
})

test('a permission prompt is a confirmed wait, and the tool finishing ends it', async () => {
  let list = started([], { id: 'a', type: 'Explore' }, 0)
  list = toolBegan(list, 'a', 'Edit', 'Edit app.ts', 1)
  list = waiting(list, 'a')
  expect(one(list, 'a').activity).toBe('waiting')
  expect(tally(list).waiting).toBe(1)

  list = toolEnded(list, 'a')
  expect(one(list, 'a').activity).toBe('working')
})

test('the end of a turn finishes a subagent, with the reason when it failed', async () => {
  let list = started([], { id: 'a', type: 'Explore' }, 0)
  list = started(list, { id: 'b', type: 'Explore' }, 0)
  list = started(list, { id: 'c', type: 'Explore' }, 0)
  list = turnEnded(list, 'a', 'answer', 9000)
  list = turnEnded(list, 'b', 'error', 9000)
  list = turnEnded(list, 'c', 'aborted', 9000)

  expect(one(list, 'a')).toMatchObject({ status: 'done', endedAt: 9000, note: '' })
  expect(one(list, 'b')).toMatchObject({ status: 'failed', note: 'error' })
  expect(one(list, 'c')).toMatchObject({ status: 'failed', note: 'aborted' })
})

test('a teammate goes idle between turns instead of finishing', async () => {
  let list = started([], { id: 't', name: 'ana', type: 'teammate', kind: 'teammate' }, 0)
  list = turnEnded(list, 't', 'answer', 5000)
  expect(one(list, 't').status).toBe('idle')

  list = stopped(list, 't', 6000)
  expect(one(list, 't').status).toBe('idle')

  list = toolBegan(list, 't', 'Read', 'Read a.ts', 7000)
  expect(one(list, 't').status).toBe('running')
})

test('an agent seen working again after finishing is running again', async () => {
  let list = started([], { id: 'a', type: 'Explore' }, 0)
  list = turnEnded(list, 'a', 'answer', 100)
  list = toolBegan(list, 'a', 'Grep', 'Grep x', 200)

  expect(one(list, 'a')).toMatchObject({ status: 'running', endedAt: 0 })
})

test('a tool call from a loop nobody announced still gets a character', async () => {
  const list = toolBegan([], 'ghost', 'Read', 'Read a.ts', 50)

  expect(one(list, 'ghost')).toMatchObject({ status: 'running', type: '', startedAt: 50 })
})

test('after a reload, the engine list restores what it can and nothing more', async () => {
  // Found running in the list, never seen starting: no start time.
  let list = reconciled([], [{ id: 'x', description: 'Revisar', type: 'general-purpose', status: 'running' }], 100)
  expect(one(list, 'x')).toMatchObject({ status: 'running', name: 'Revisar', startedAt: 0 })

  // Finished before the mod could see it: not invented.
  list = reconciled(list, [{ id: 'old', description: 'Viejo', type: 'Explore', status: 'completed' }], 100)
  expect(list.find(agent => agent.id === 'old')).toBeUndefined()
})

test('silence is not an ending: a running agent the list drops becomes unknown', async () => {
  let list = started([], { id: 'a', type: 'Explore' }, 0)
  list = reconciled(list, [{ id: 'a', description: '', type: 'Explore', status: 'running' }], 50)
  list = reconciled(list, [], 100)

  expect(one(list, 'a').status).toBe('unknown')
  expect(tally(list)).toMatchObject({ done: 0, unknown: 1 })

  // Evidence brings it back.
  list = reconciled(list, [{ id: 'a', description: '', type: 'Explore', status: 'running' }], 200)
  expect(one(list, 'a').status).toBe('running')
})

test('the engine list settles a status the events missed', async () => {
  let list = started([], { id: 'a', type: 'Explore' }, 0)
  list = reconciled(list, [{ id: 'a', description: '', type: 'Explore', status: 'killed' }], 300)
  expect(one(list, 'a')).toMatchObject({ status: 'failed', note: 'killed', endedAt: 300 })

  let other = started([], { id: 'b', type: 'Explore' }, 0)
  other = reconciled(other, [{ id: 'b', description: '', type: 'Explore', status: 'completed' }], 300)
  expect(one(other, 'b').status).toBe('done')
})

test('identities are stable: sequence numbers never repeat or shift', async () => {
  let list = started([], { id: 'a', type: 'Explore' }, 0)
  list = started(list, { id: 'b', type: 'Explore' }, 0)
  list = turnEnded(list, 'a', 'answer', 1)
  list = started(list, { id: 'c', type: 'Explore' }, 2)

  expect(list.map(agent => [agent.id, agent.seq])).toEqual([
    ['a', 0],
    ['b', 1],
    ['c', 2],
  ])
})

test('the demo walks flagged agents through every state and starts no real one', async () => {
  let list = started([], { id: 'real', type: 'Explore' }, 0)
  const seen = new Set<string>()

  for (let step = 0; step < DEMO_STEPS * 2; step++) {
    list = demoStep(list, step, step * 500)

    for (const agent of list) {
      if (agent.isDemo) seen.add(agent.status === 'running' ? agent.activity : agent.status)
      else expect(agent.id).toBe('real')
    }
  }

  expect([...seen].sort()).toEqual(['done', 'editing', 'failed', 'reading', 'searching', 'tool', 'waiting', 'working'])
  expect(one(list, 'real')).toMatchObject({ status: 'running', isDemo: false })
})

test('an agent the list never names (a workflow one) keeps working between its tools', async () => {
  let list = toolBegan([], 'wf', 'Read', 'Read a.ts', 0)
  list = toolEnded(list, 'wf', 1000)

  // Thinking between two tools, for a good while: still at work, no "?".
  list = reconciled(list, [], 5000)
  list = reconciled(list, [], 60_000)
  expect(one(list, 'wf').status).toBe('running')

  // A long silence with nothing in flight is no longer evidence of work.
  list = reconciled(list, [], 120_000)
  expect(one(list, 'wf').status).toBe('unknown')

  // Its next tool brings it straight back.
  list = toolBegan(list, 'wf', 'Grep', 'Grep x', 121_000)
  expect(one(list, 'wf').status).toBe('running')
})

test('an agent with no evidence for a long while leaves, and is never called finished', async () => {
  let list = started([], { id: 'a', type: 'Explore' }, 0)
  list = reconciled(list, [{ id: 'a', description: '', type: 'Explore', status: 'running' }], 10)
  list = reconciled(list, [], 20)
  expect(one(list, 'a').status).toBe('unknown')

  expect(pruned(list, 60_000)).toHaveLength(1)
  const after = pruned(list, 10 * 60_000)
  expect(after).toHaveLength(0)
  expect(tally(after)).toMatchObject({ done: 0, unknown: 0 })
})

test('a teammate whose first turn ended before the list named it goes idle, not done', async () => {
  let list = started([], { id: 't', name: 'ana', type: 'general-purpose' }, 0)
  list = turnEnded(list, 't', 'answer', 1000)
  expect(one(list, 't').status).toBe('done')

  list = reconciled(list, [{ id: 't', description: 'ana', type: 'teammate', status: 'running' }], 2000)
  expect(one(list, 't')).toMatchObject({ status: 'idle', kind: 'teammate', endedAt: 0 })
})

test('a poll that changes nothing hands back the very same list', async () => {
  let list = started([], { id: 'a', type: 'Explore' }, 0)
  const listed = [{ id: 'a', description: '', type: 'Explore', status: 'running' }]
  list = reconciled(list, listed, 100)

  // Later polls, the same answer: nothing to write, nothing to redraw.
  expect(reconciled(list, [{ ...listed[0]! }], 4100)).toBe(list)
  expect(reconciled(list, [{ ...listed[0]! }], 60_000)).toBe(list)
})

test('each agent keeps the files its tools touched and how its tools ended, and who spawned it', async () => {
  let list = started([], { id: 'a', type: 'Explore', parentId: 'lead' }, 0)
  list = toolBegan(list, 'a', 'Edit', 'Edit app.ts', 10, { path: 'C:/repo/src/app.ts', isWrite: true, at: 10 })
  list = toolEnded(list, 'a', 20, 'err')
  list = toolBegan(list, 'a', 'Read', 'Read app.ts', 30, { path: 'C:/repo/src/app.ts', isWrite: false, at: 30 })
  list = toolEnded(list, 'a', 40, 'ok')

  expect(one(list, 'a')).toMatchObject({ parentId: 'lead', trail: ['err', 'ok'] })
  // One entry per file, the latest touch kept.
  expect(one(list, 'a').files).toEqual([{ path: 'C:/repo/src/app.ts', isWrite: false, at: 30 }])
})
