import { en } from './jezyki/en.js'
import { pl } from './jezyki/pl.js'

export const JEZYKI = { en, pl }

// Angielski jest domyslny, bo aplikacja wychodzi poza jeden komputer.
// Polski zostaje pelnoprawnym jezykiem, nie tlumaczeniem drugiej kategorii.
export const JEZYK_DOMYSLNY = 'en'

const NAZWY_WLASNE = { en: 'English', pl: 'Polski' }

export function dostepneJezyki() {
  return Object.keys(JEZYKI).map((kod) => ({ kod, nazwa: NAZWY_WLASNE[kod] }))
}

export function poprawnyJezyk(kod) {
  return Object.hasOwn(JEZYKI, String(kod)) ? String(kod) : JEZYK_DOMYSLNY
}

export function t(jezyk, klucz, parametry = {}) {
  const kod = poprawnyJezyk(jezyk)
  let wzor = JEZYKI[kod][klucz] ?? JEZYKI[JEZYK_DOMYSLNY][klucz]
  // Brakujacy klucz oddajemy w calosci: goly klucz w interfejsie widac od razu,
  // a pusty napis wyglada jak celowo puste miejsce i potrafi przezyc wydanie.
  if (wzor === undefined) return klucz

  if (typeof wzor === 'object') {
    // Kategorie liczby mnogiej bierze Intl, bo kazdy jezyk ma wlasne reguly.
    // Warunek pisany recznie dziala wylacznie dla jezyka, pod ktory powstal —
    // polskie 1/2-4/5+ nalozone na angielski daje "1 new" obok "3 new".
    const kategoria = new Intl.PluralRules(kod).select(Number(parametry.n) || 0)
    wzor = wzor[kategoria] ?? wzor.other ?? klucz
  }

  return String(wzor).replace(/\{(\w+)\}/g, (calosc, nazwa) =>
    Object.hasOwn(parametry, nazwa) ? String(parametry[nazwa]) : calosc,
  )
}
