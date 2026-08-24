import { en } from './locales/en.js'
import { pl } from './locales/pl.js'

export const LOCALES = { en, pl }

// English is the default, because the app travels beyond one machine.
// Polish stays a first-class language, not a second-rate translation.
export const DEFAULT_LANGUAGE = 'en'

// Each language signs itself with its own name: someone looking for Polish is looking
// for the word "Polski", not for its translation into a language they cannot read.
const ENDONYMS = { en: 'English', pl: 'Polski' }

export function availableLanguages() {
  return Object.keys(LOCALES).map((code) => ({ code, name: ENDONYMS[code] }))
}

export function validLanguage(code) {
  return Object.hasOwn(LOCALES, String(code)) ? String(code) : DEFAULT_LANGUAGE
}

// Both processes use this. The main process needs it for the tray menu and for load
// errors; the renderer for everything else. It is therefore shared code, not renderer
// code — a main process importing from src/renderer would be the wrong way round.
export function t(language, key, params = {}) {
  const code = validLanguage(language)
  let pattern = LOCALES[code][key] ?? LOCALES[DEFAULT_LANGUAGE][key]
  // A missing key is handed back whole: a bare key is visible in the interface at once,
  // while an empty string looks like a deliberate blank and can survive a release.
  if (pattern === undefined) return key

  if (typeof pattern === 'object') {
    // Plural categories come from Intl, because every language has its own rules.
    // A hand-written condition only works for the language it was written for —
    // Polish 1/2-4/5+ laid over English yields "1 new" next to "3 new".
    const category = new Intl.PluralRules(code).select(Number(params.n) || 0)
    pattern = pattern[category] ?? pattern.other ?? key
  }

  return String(pattern).replace(/\{(\w+)\}/g, (whole, name) =>
    Object.hasOwn(params, name) ? String(params[name]) : whole,
  )
}
