import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  wczytajKonta,
  zapiszKonta,
  waliduj,
  utworzIdKonta,
  zmienKonto,
  przesun,
  wolnyKolor,
  PALETA_KANALOW,
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
    expect(waliduj({ ...poprawne, nazwa: '  ' }).map((blad) => blad.kod)).toContain('walidacjaNazwa')
  })

  test('nieznana platforma jest bledem', () => {
    expect(waliduj({ ...poprawne, platforma: 'signal' })).toContainEqual({
      kod: 'walidacjaPlatforma',
      parametry: { platforma: 'signal' },
    })
  })

  test('adres inny niz https jest bledem', () => {
    expect(waliduj({ ...poprawne, url: 'http://web.whatsapp.com/' }).map((blad) => blad.kod)).toContain(
      'walidacjaUrl',
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

const trzyKonta = () => [
  { id: 'acc-messenger', nazwa: 'Messenger', platforma: 'messenger', url: 'https://www.messenger.com/', kolor: '#6586ec' },
  { id: 'acc-whatsapp-priv', nazwa: 'WhatsApp_PRIV', platforma: 'whatsapp', url: 'https://web.whatsapp.com/', kolor: '#2f7d5b' },
  { id: 'acc-whatsapp-work', nazwa: 'WhatsApp_WORK', platforma: 'whatsapp', url: 'https://web.whatsapp.com/', kolor: '#2f7d5b' },
]

describe('zmienKonto', () => {
  test('zmiana nazwy NIE rusza id — na id stoi partycja sesji', () => {
    const wynik = zmienKonto(trzyKonta(), 'acc-whatsapp-priv', { nazwa: 'WhatsApp Dom', kolor: '#2f7d5b' })

    expect(wynik.ok).toBe(true)
    expect(wynik.konta[1].id).toBe('acc-whatsapp-priv')
    expect(wynik.konta[1].nazwa).toBe('WhatsApp Dom')
  })

  test('zmiana zostawia konto na tej samej pozycji', () => {
    const wynik = zmienKonto(trzyKonta(), 'acc-messenger', { nazwa: 'Messenger firmowy', kolor: '#6586ec' })

    expect(wynik.konta.map((k) => k.id)).toEqual(['acc-messenger', 'acc-whatsapp-priv', 'acc-whatsapp-work'])
  })

  test('platforma i adres przezywaja zmiane nazwy', () => {
    const wynik = zmienKonto(trzyKonta(), 'acc-whatsapp-work', { nazwa: 'Praca', kolor: '#123456' })

    expect(wynik.konta[2].platforma).toBe('whatsapp')
    expect(wynik.konta[2].url).toBe('https://web.whatsapp.com/')
    expect(wynik.konta[2].kolor).toBe('#123456')
  })

  test('pusta nazwa jest odrzucana, lista zostaje nietknieta', () => {
    const konta = trzyKonta()
    const wynik = zmienKonto(konta, 'acc-messenger', { nazwa: '   ', kolor: '#6586ec' })

    expect(wynik.ok).toBe(false)
    expect(wynik.bledy.map((blad) => blad.kod)).toContain('walidacjaNazwa')
    expect(konta[0].nazwa).toBe('Messenger')
  })

  // Jezyk interfejsu wybiera renderer, wiec proces glowny nie moze zwracac gotowych
  // zdan — po angielsku wyciekly by polskie. Oddaje kod i parametry, tekst sklada t().
  test('bledy walidacji wracaja jako kody z parametrami, nie gotowe zdania', () => {
    const bledy = waliduj({ id: 'acc-x', nazwa: '', platforma: 'nieznana', url: 'http://x', kolor: 'zielony' })

    expect(bledy.map((blad) => blad.kod)).toEqual([
      'walidacjaNazwa',
      'walidacjaPlatforma',
      'walidacjaUrl',
      'walidacjaKolor',
    ])
    expect(bledy.find((blad) => blad.kod === 'walidacjaPlatforma').parametry).toEqual({ platforma: 'nieznana' })
  })

  test('nieznane id daje blad, nie wyjatek', () => {
    expect(zmienKonto(trzyKonta(), 'acc-nie-ma', { nazwa: 'X', kolor: '#000000' }).ok).toBe(false)
  })
})

describe('przesun', () => {
  test('przesuniecie w gore zamienia konto z poprzednim', () => {
    const wynik = przesun(trzyKonta(), 'acc-whatsapp-priv', -1)

    expect(wynik.map((k) => k.id)).toEqual(['acc-whatsapp-priv', 'acc-messenger', 'acc-whatsapp-work'])
  })

  test('przesuniecie w dol zamienia konto z nastepnym', () => {
    const wynik = przesun(trzyKonta(), 'acc-messenger', 1)

    expect(wynik.map((k) => k.id)).toEqual(['acc-whatsapp-priv', 'acc-messenger', 'acc-whatsapp-work'])
  })

  test('pierwsze konto nie da sie przesunac wyzej', () => {
    const wynik = przesun(trzyKonta(), 'acc-messenger', -1)

    expect(wynik.map((k) => k.id)).toEqual(['acc-messenger', 'acc-whatsapp-priv', 'acc-whatsapp-work'])
  })

  test('ostatnie konto nie da sie przesunac nizej', () => {
    const wynik = przesun(trzyKonta(), 'acc-whatsapp-work', 1)

    expect(wynik.map((k) => k.id)).toEqual(['acc-messenger', 'acc-whatsapp-priv', 'acc-whatsapp-work'])
  })

  test('zrodlowa lista zostaje nietknieta', () => {
    const konta = trzyKonta()
    przesun(konta, 'acc-messenger', 1)

    expect(konta.map((k) => k.id)).toEqual(['acc-messenger', 'acc-whatsapp-priv', 'acc-whatsapp-work'])
  })
})

describe('wolnyKolor', () => {
  test('pierwsze konto dostaje pierwszy kolor palety', () => {
    expect(wolnyKolor([])).toBe(PALETA_KANALOW[0])
  })

  test('drugie konto NIE dostaje koloru pierwszego — na tym stoi rozroznienie kanalow', () => {
    const zajety = [{ kolor: PALETA_KANALOW[0] }]

    expect(wolnyKolor(zajety)).not.toBe(PALETA_KANALOW[0])
    expect(PALETA_KANALOW).toContain(wolnyKolor(zajety))
  })

  test('porownanie ignoruje wielkosc liter w zapisie koloru', () => {
    expect(wolnyKolor([{ kolor: PALETA_KANALOW[0].toUpperCase() }])).not.toBe(PALETA_KANALOW[0])
  })

  test('gdy cala paleta zajeta, wraca do pierwszego zamiast zwrocic nic', () => {
    const wszystkie = PALETA_KANALOW.map((kolor) => ({ kolor }))

    expect(PALETA_KANALOW).toContain(wolnyKolor(wszystkie))
  })
})
