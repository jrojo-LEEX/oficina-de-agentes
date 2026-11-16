import { afterEach, describe, expect, test, vi } from 'vitest'

import { DayLog } from '../../src/office/daylog.ts'
import { Stats } from '../../src/office/stats.ts'
import { shortTokens } from '../../src/spend.ts'

const memory = () => {
  const data = new Map<string, string>()

  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) } as unknown as Storage
}

afterEach(() => vi.useRealTimers())

describe('numbers', () => {
  test('a value that rounds up to the next unit is said in it', () => {
    expect(shortTokens(999_999, 'es')).toBe('1,0 M')
    expect(shortTokens(999_950, 'en')).toBe('1.0 M')
    expect(shortTokens(999_949, 'en')).toBe('999.9 k')
    expect(shortTokens(999_999_999, 'en')).toBe('1.0 B')
    expect(shortTokens(8500, 'es')).toBe('8,5 k')
    expect(shortTokens(999, 'es')).toBe('999')
  })
})

describe('the whip hit counts', () => {
  test('the day and the month roll over on their own, without waiting for the next hit', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 31, 23, 0))
    const stats = new Stats(memory())
    stats.record('Explorador', true)
    expect(stats.today).toBe(1)
    expect(stats.monthOf('Explorador')).toBe(1)

    // The office stays open overnight: nothing is recorded, yet the counts read from zero.
    vi.setSystemTime(new Date(2026, 1, 1, 9, 0))
    expect(stats.today).toBe(0)
    expect(stats.criticalsToday).toBe(0)
    expect(stats.monthOf('Explorador')).toBe(0)
    expect(stats.employeeOfTheMonth()).toBeNull()
  })

  test('an agent named like a built-in is counted as a number', () => {
    const stats = new Stats(memory())
    stats.record('toString', false)
    stats.record('toString', false)

    expect(stats.monthOf('toString')).toBe(2)
    expect(stats.monthOf('constructor')).toBe(0)
    expect(stats.employeeOfTheMonth()).toEqual({ name: 'toString', hits: 2 })
  })
})

describe('the day report', () => {
  test('one agent changing does not refresh the others’ last-seen time', () => {
    const log = new DayLog(memory())
    const agent = (key: string, status: string) => ({ key, name: key, type: 'x', session: 's', sessionId: 's', startedAt: 1, endedAt: 0, status, note: '', isBoss: false, isDemo: false }) as never
    log.update([agent('A', 'done')] as never, new Date(2026, 10, 16, 10, 0))
    log.update([agent('B', 'running'), agent('A', 'done')] as never, new Date(2026, 10, 16, 11, 0))
    const a = log.entries().find(entry => entry.key === 'A')!

    expect(a.seenAt).toBe(new Date(2026, 10, 16, 10, 0).getTime())
  })
})
