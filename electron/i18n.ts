// Texts in Spanish and English. The language follows Windows unless the
// person picks one from the tray; anything not Spanish gets English. The
// same tables serve the main process and the page (src/i18n.ts). No
// Electron here, so a test can reach it.

import i18next from 'i18next'
import type { TFunction } from 'i18next'

// With their extension, so Node's own type stripping (the node:test suites)
// loads this file as it is; tsc rewrites them to `.js` for Electron.
import en from './locales/en.ts'
import es from './locales/es.ts'

export type Language = 'es' | 'en'
export type LanguageSetting = 'auto' | Language

export const RESOURCES = { es: { translation: es }, en: { translation: en } } as const

/** The language to show: the one picked, else the first of the system's that is Spanish or English, else English. */
export const languageOf = (setting: LanguageSetting, system: readonly string[]): Language => {
  if (setting === 'es' || setting === 'en') return setting

  for (const tag of system) {
    const base = tag.toLowerCase().split(/[-_]/)[0]

    if (base === 'es' || base === 'en') return base
  }

  return 'en'
}

/** The locale dates and numbers are written in. */
export const localeOf = (language: Language) => (language === 'es' ? 'es-AR' : 'en-US')

const instance = i18next.createInstance()
void instance.init({
  lng: 'es',
  fallbackLng: 'en',
  resources: RESOURCES,
  interpolation: { escapeValue: false },
  initAsync: false,
  returnNull: false,
})

/** Switches the language for every later `t`. */
export const setLanguage = (language: Language) => {
  void instance.changeLanguage(language)
}

export const currentLanguage = (): Language => (instance.language === 'en' ? 'en' : 'es')

export const t: TFunction = ((...args: Parameters<TFunction>) => instance.t(...args)) as TFunction
