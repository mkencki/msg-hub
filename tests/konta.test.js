import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  wczytajKonta,
  zapiszKonta,
  waliduj,
  utworzIdKonta,
  WERSJA_SCHEMATU,
} from '../src/glowny/konta.js'

let katalog
let plik

beforeEach(async () => {
  katalog = await mkdtemp(path.join(tmpdir(), 'msghub-'))
  plik = path.join(katalog, 'accounts.json')
})

afterEach(async () => {
  await rm(katalog, { recursive: true, force: true })
})

describe('wczytajKonta', () => {
  test('brak pliku daje pusta liste, nie blad', async () => {
    const wynik = await wczytajKonta(plik)
    expect(wynik.konta).toEqual([])
    expect(wynik.wersja).toBe(WERSJA_SCHEMATU)
  })

  test('czyta zapisane konta', async () => {
    const konta = [
      { id: 'acc-a', nazwa: 'A', platforma: 'whatsapp', url: 'https://web.whatsapp.com/', kolor: '#2f7d5b' },
    ]
    await zapiszKonta(plik, konta)
    const wynik = await wczytajKonta(plik)
    expect(wynik.konta).toHaveLength(1)
    expect(wynik.konta[0].id).toBe('acc-a')
  })

  test('uszkodzony plik odklada kopie zapasowa i startuje pusto', async () => {
    await writeFile(plik, '{to nie jest json', 'utf8')
    const wynik = await wczytajKonta(plik)
    expect(wynik.konta).toEqual([])
    const kopia = await readFile(plik + '.uszkodzony', 'utf8')
    expect(kopia).toContain('to nie jest json')
  })
})

describe('waliduj', () => {
  const poprawne = {
    id: 'acc-a',
    nazwa: 'A',
    platforma: 'whatsapp',
    url: 'https://web.whatsapp.com/',
    kolor: '#2f7d5b',
  }

  test('poprawne konto nie ma bledow', () => {
    expect(waliduj(poprawne)).toEqual([])
  })

  test('pusta nazwa jest bledem', () => {
    expect(waliduj({ ...poprawne, nazwa: '  ' })).toContain('nazwa jest wymagana')
  })

  test('nieznana platforma jest bledem', () => {
    expect(waliduj({ ...poprawne, platforma: 'signal' })).toContain('nieznana platforma: signal')
  })

  test('adres inny niz https jest bledem', () => {
    expect(waliduj({ ...poprawne, url: 'http://web.whatsapp.com/' })).toContain(
      'adres musi zaczynac sie od https://',
    )
  })
})

describe('utworzIdKonta', () => {
  test('tworzy id ze znakow bezpiecznych', () => {
    expect(utworzIdKonta('WhatsApp sluzbowy', [])).toMatch(/^acc-[a-z0-9-]+$/)
  })

  test('unika kolizji z istniejacym id', () => {
    const pierwsze = utworzIdKonta('WhatsApp', [])
    const drugie = utworzIdKonta('WhatsApp', [pierwsze])
    expect(drugie).not.toBe(pierwsze)
  })

  test('polskie znaki sa transliterowane, nie wycinane do pustki', () => {
    expect(utworzIdKonta('Służbowy', [])).toBe('acc-sluzbowy')
  })
})

describe('zapiszKonta', () => {
  test('odmawia zapisu przy duplikacie id', async () => {
    const konta = [
      { id: 'acc-a', nazwa: 'A', platforma: 'whatsapp', url: 'https://web.whatsapp.com/', kolor: '#2f7d5b' },
      { id: 'acc-a', nazwa: 'B', platforma: 'whatsapp', url: 'https://web.whatsapp.com/', kolor: '#2f7d5b' },
    ]
    await expect(zapiszKonta(plik, konta)).rejects.toThrow(/duplikat id/)
  })
})
