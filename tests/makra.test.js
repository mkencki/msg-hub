import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { wczytajMakra, zapiszMakra, szukaj, utworzIdMakra } from '../src/glowny/makra.js'

let plik, katalog

const makro = (nadpisania = {}) => ({
  id: 'mac-test',
  nazwa: 'Instrukcja Strefa Klienta',
  tekst: '*Jak dodac kierowce:*\n1. Zaloguj sie',
  zalaczniki: [],
  tagi: ['strefa'],
  ...nadpisania,
})

beforeEach(async () => {
  katalog = await mkdtemp(path.join(tmpdir(), 'msghub-makra-'))
  plik = path.join(katalog, 'macros.json')
})

afterEach(async () => {
  await rm(katalog, { recursive: true, force: true })
})

describe('magazyn makr', () => {
  test('brak pliku daje pusta liste', async () => {
    expect((await wczytajMakra(plik)).makra).toEqual([])
  })

  test('makro przezywa zapis i odczyt razem z formatowaniem', async () => {
    await zapiszMakra(plik, [makro()])
    const wynik = await wczytajMakra(plik)
    expect(wynik.makra[0].tekst).toBe('*Jak dodac kierowce:*\n1. Zaloguj sie')
  })
})

describe('szukaj', () => {
  const zbior = [
    makro({ id: 'mac-a', nazwa: 'Strefa Klienta', tekst: 'logowanie', tagi: ['strefa'] }),
    makro({ id: 'mac-b', nazwa: 'Passango', tekst: 'instalacja urzadzenia', tagi: ['passango'] }),
  ]

  test('znajduje po nazwie bez wzgledu na wielkosc liter', () => {
    expect(szukaj(zbior, 'strefa').map((m) => m.id)).toEqual(['mac-a'])
  })

  test('znajduje po tresci', () => {
    expect(szukaj(zbior, 'instalacja').map((m) => m.id)).toEqual(['mac-b'])
  })

  test('znajduje po tagu', () => {
    expect(szukaj(zbior, 'passango').map((m) => m.id)).toEqual(['mac-b'])
  })

  test('pusta fraza zwraca wszystko', () => {
    expect(szukaj(zbior, '   ')).toHaveLength(2)
  })
})

describe('utworzIdMakra', () => {
  test('tworzy id ze znakow bezpiecznych', () => {
    expect(utworzIdMakra('Instrukcja — Strefa Klienta!')).toMatch(/^mac-[a-z0-9-]+$/)
  })

  test('polskie znaki sa transliterowane', () => {
    expect(utworzIdMakra('Załączniki')).toBe('mac-zalaczniki')
  })
})
