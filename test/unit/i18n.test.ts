import { describe, expect, test } from 'vitest'

import { languageOf, setLanguage, t } from '../../electron/i18n'
import en from '../../electron/locales/en'
import es from '../../electron/locales/es'

/** Every key path of a table, with its text. */
const leaves = (table: object, prefix = ''): Map<string, string> => {
  const found = new Map<string, string>()

  for (const [key, value] of Object.entries(table)) {
    const at = prefix ? `${prefix}.${key}` : key

    if (typeof value === 'string') found.set(at, value)
    else for (const [inner, text] of leaves(value as object, at)) found.set(inner, text)
  }

  return found
}

const placeholders = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map(match => match[1]).sort()

describe('the texts', () => {
  const spanish = leaves(es)
  const english = leaves(en)

  test('both languages have exactly the same keys', () => {
    expect([...english.keys()].sort()).toEqual([...spanish.keys()].sort())
  })

  test('no text is empty, and each keeps the same placeholders in both languages', () => {
    for (const [key, text] of spanish) {
      expect(text.trim(), key).not.toBe('')
      expect(english.get(key)?.trim(), key).not.toBe('')
      expect(placeholders(english.get(key) ?? ''), key).toEqual(placeholders(text))
    }
  })

  test('the language follows Windows unless one is picked; anything else is English', () => {
    expect(languageOf('auto', ['es-AR', 'en-US'])).toBe('es')
    expect(languageOf('auto', ['es'])).toBe('es')
    expect(languageOf('auto', ['en-GB'])).toBe('en')
    expect(languageOf('auto', ['fr-FR', 'es-ES'])).toBe('es')
    expect(languageOf('auto', ['de-DE'])).toBe('en')
    expect(languageOf('auto', [])).toBe('en')
    expect(languageOf('es', ['en-US'])).toBe('es')
    expect(languageOf('en', ['es-AR'])).toBe('en')
  })

  test('switching the language switches every text, plurals and placeholders included', () => {
    setLanguage('en')
    expect(t('notify.done', { name: 'Explore' })).toBe('Explore finished')
    expect(t('setup.sessionsSome', { count: 2 })).toBe('2 live sessions. Look at the corner of the screen.')
    setLanguage('es')
    expect(t('notify.done', { name: 'Explore' })).toBe('Explore terminó')
    expect(t('setup.sessionsSome', { count: 1 })).toBe('1 sesión en vivo. Mira la esquina de la pantalla.')
  })
})
