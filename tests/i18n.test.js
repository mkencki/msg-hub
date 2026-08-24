import { describe, test, expect } from 'vitest'
import { t, JEZYKI, JEZYK_DOMYSLNY, dostepneJezyki } from '../src/renderer/i18n.js'

describe('tlumaczenia', () => {
  test('domyslnym jezykiem jest angielski', () => {
    expect(JEZYK_DOMYSLNY).toBe('en')
  })

  test('zwraca tekst w wybranym jezyku', () => {
    expect(t('en', 'dodajKonto')).toBe('Add account')
    expect(t('pl', 'dodajKonto')).toBe('Dodaj konto')
  })

  test('nieznany klucz zwraca sam klucz, zeby brak tlumaczenia byl widoczny', () => {
    expect(t('en', 'klucz-ktorego-nie-ma')).toBe('klucz-ktorego-nie-ma')
  })

  test('nieznany jezyk spada na domyslny zamiast pokazywac pustke', () => {
    expect(t('de', 'dodajKonto')).toBe(t('en', 'dodajKonto'))
  })

  test('wstawia parametry w miejsce znacznikow', () => {
    expect(t('en', 'usunMakroPytanie', { nazwa: 'Oferta' })).toContain('Oferta')
    expect(t('pl', 'usunMakroPytanie', { nazwa: 'Oferta' })).toContain('Oferta')
  })

  // Polska odmiana ma trzy formy: 1 / 2-4 / 5+, z wyjatkiem nastolatkow (12-14 idzie
  // do formy "wiele"). Angielska ma dwie. Roznicy nie da sie zaszyc w rendererze —
  // musi siedziec w warstwie jezyka, inaczej angielski dostanie polska gramatyke.
  test('polska liczba mnoga odmienia sie przez trzy formy', () => {
    expect(t('pl', 'nieprzeczytane', { n: 1 })).toBe('1 nowa')
    expect(t('pl', 'nieprzeczytane', { n: 3 })).toBe('3 nowe')
    expect(t('pl', 'nieprzeczytane', { n: 5 })).toBe('5 nowych')
    expect(t('pl', 'nieprzeczytane', { n: 13 })).toBe('13 nowych')
    expect(t('pl', 'nieprzeczytane', { n: 22 })).toBe('22 nowe')
  })

  test('angielska liczba mnoga ma dwie formy', () => {
    expect(t('en', 'nieprzeczytane', { n: 1 })).toBe('1 new')
    expect(t('en', 'nieprzeczytane', { n: 5 })).toBe('5 new')
  })

  test('dostepne jezyki wymieniaja angielski i polski z wlasnymi nazwami', () => {
    expect(dostepneJezyki()).toEqual([
      { kod: 'en', nazwa: 'English' },
      { kod: 'pl', nazwa: 'Polski' },
    ])
  })

  // Bez tego slowniki cicho sie rozjezdzaja: nowy tekst trafia do jednego jezyka,
  // a drugi pokazuje goly klucz dopiero u uzytkownika.
  test('oba slowniki maja dokladnie te same klucze', () => {
    expect(Object.keys(JEZYKI.pl).sort()).toEqual(Object.keys(JEZYKI.en).sort())
  })
})
