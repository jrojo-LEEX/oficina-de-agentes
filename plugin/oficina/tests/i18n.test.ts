import { expect, test } from 'claude-code/testing'

import { EN, ES, langOf, say } from '../hooks/i18n.ts'

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort()

test('the Spanish and English tables have the same keys, each with the same placeholders', async () => {
  expect(Object.keys(EN).sort()).toEqual(Object.keys(ES).sort())

  for (const key of Object.keys(ES) as (keyof typeof ES)[]) {
    expect(typeof EN[key]).toBe('string')
    expect(EN[key].trim()).not.toBe('')
    expect(ES[key].trim()).not.toBe('')
    expect(placeholders(EN[key])).toEqual(placeholders(ES[key]))
  }
})

test('a string is filled by name, and a name not given is left as written', async () => {
  expect(say('es', 'active', { n: 2 })).toBe('En curso: 2')
  expect(say('en', 'activeWaiting', { n: 3, waiting: 1 })).toBe('Running: 3 (1 waiting for your permission)')
  expect(say('en', 'soundOn')).toBe('Sound: {percent}%')
})

test('Spanish only when the first value given looks Spanish', async () => {
  expect(langOf(['es'])).toBe('es')
  expect(langOf(['es_AR.UTF-8'])).toBe('es')
  expect(langOf(['es-419'])).toBe('es')
  expect(langOf(['Spanish'])).toBe('es')
  expect(langOf(['español'])).toBe('es')
  expect(langOf([undefined, '', '  ', 'es_MX'])).toBe('es')
  expect(langOf(['en', 'es'])).toBe('en')
  expect(langOf(['estonian'])).toBe('en')
  expect(langOf(['C.UTF-8'])).toBe('en')
  expect(langOf([])).toBe('en')
  expect(langOf([42, { language: 'es' }])).toBe('en')
})
