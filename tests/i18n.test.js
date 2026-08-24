import { describe, test, expect } from 'vitest'
import { t, LOCALES, DEFAULT_LANGUAGE, availableLanguages, validLanguage } from '../src/shared/i18n.js'

describe('translation', () => {
  test('the default language is English', () => {
    expect(DEFAULT_LANGUAGE).toBe('en')
  })

  test('returns text in the chosen language', () => {
    expect(t('en', 'addAccount')).toBe('Add account')
    expect(t('pl', 'addAccount')).toBe('Dodaj konto')
  })

  test('an unknown key comes back whole, so a missing translation is visible', () => {
    expect(t('en', 'no-such-key')).toBe('no-such-key')
  })

  test('an unknown language falls back to the default instead of showing blanks', () => {
    expect(t('de', 'addAccount')).toBe(t('en', 'addAccount'))
    expect(validLanguage('de')).toBe('en')
  })

  test('parameters are substituted for their placeholders', () => {
    expect(t('en', 'macroWillDisappear', { name: 'Offer' })).toContain('Offer')
    expect(t('pl', 'macroWillDisappear', { name: 'Oferta' })).toContain('Oferta')
  })

  test('a placeholder with no matching parameter is left alone, not blanked', () => {
    expect(t('en', 'macroWillDisappear', {})).toContain('{name}')
  })

  // Polish has three plural forms: 1 / 2-4 / 5+, with the teens (12-14) falling into the
  // "many" form. English has two. The difference cannot live in the renderer — it belongs
  // to the language layer, or English inherits Polish grammar.
  test('Polish plurals inflect through three forms', () => {
    expect(t('pl', 'unreadNew', { n: 1 })).toBe('1 nowa')
    expect(t('pl', 'unreadNew', { n: 3 })).toBe('3 nowe')
    expect(t('pl', 'unreadNew', { n: 5 })).toBe('5 nowych')
    expect(t('pl', 'unreadNew', { n: 13 })).toBe('13 nowych')
    expect(t('pl', 'unreadNew', { n: 22 })).toBe('22 nowe')
  })

  test('English plurals have two forms', () => {
    expect(t('en', 'unreadNew', { n: 1 })).toBe('1 new')
    expect(t('en', 'unreadNew', { n: 5 })).toBe('5 new')
  })

  test('each language is listed under its own name', () => {
    expect(availableLanguages()).toEqual([
      { code: 'en', name: 'English' },
      { code: 'pl', name: 'Polski' },
    ])
  })

  // Without this the dictionaries drift apart quietly: new text lands in one language and
  // the other shows a bare key, discovered only by the user.
  test('both dictionaries carry exactly the same keys', () => {
    expect(Object.keys(LOCALES.pl).sort()).toEqual(Object.keys(LOCALES.en).sort())
  })
})
