import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile as zapiszPlik, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  wczytajMakra,
  zapiszMakra,
  szukaj,
  utworzIdMakra,
  dodajZalacznik,
  usunOsierociZalaczniki,
  zajetoscMagazynu,
  wstawLubZastap,
  LIMIT_ZALACZNIKA_BAJTY,
} from '../src/glowny/makra.js'

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

async function plikTymczasowy(katalogBazowy, nazwa, tresc = 'x') {
  const sciezka = path.join(katalogBazowy, nazwa)
  await zapiszPlik(sciezka, tresc, 'utf8')
  return sciezka
}

describe('zalaczniki', () => {
  test('dodanie kopiuje plik do magazynu i zwraca sciezke wzgledna', async () => {
    const att = path.join(katalog, 'att')
    await mkdir(att, { recursive: true })
    const zrodlo = await plikTymczasowy(katalog, 'instrukcja.pdf', 'udawany pdf')

    const wzgledna = await dodajZalacznik(att, zrodlo)

    expect(wzgledna).toMatch(/^att\/[0-9a-f-]+-instrukcja\.pdf$/)
    expect(await readdir(att)).toHaveLength(1)
  })

  test('plik ponad limit jest odrzucany z podaniem rozmiaru', async () => {
    const att = path.join(katalog, 'att')
    await mkdir(att, { recursive: true })
    const zrodlo = path.join(katalog, 'wielki.mp4')
    await zapiszPlik(zrodlo, Buffer.alloc(LIMIT_ZALACZNIKA_BAJTY + 1))

    await expect(dodajZalacznik(att, zrodlo)).rejects.toThrow(/przekracza limit/)
    expect(await readdir(att)).toHaveLength(0)
  })

  test('osierocone kopie sa usuwane, powiazane zostaja', async () => {
    const att = path.join(katalog, 'att')
    await mkdir(att, { recursive: true })
    const uzywany = await dodajZalacznik(att, await plikTymczasowy(katalog, 'uzywany.pdf'))
    await dodajZalacznik(att, await plikTymczasowy(katalog, 'sierota.pdf'))

    const usuniete = await usunOsierociZalaczniki(att, [makro({ zalaczniki: [uzywany] })])

    expect(usuniete).toHaveLength(1)
    expect(await readdir(att)).toHaveLength(1)
  })

  test('zajetosc magazynu liczy sume bajtow', async () => {
    const att = path.join(katalog, 'att')
    await mkdir(att, { recursive: true })
    await dodajZalacznik(att, await plikTymczasowy(katalog, 'a.pdf', 'xxxxx'))

    expect(await zajetoscMagazynu(att)).toBe(5)
  })
})

describe('edycja makra', () => {
  const lista = [
    makro({ id: 'mac-a', nazwa: 'Alfa' }),
    makro({ id: 'mac-b', nazwa: 'Beta' }),
    makro({ id: 'mac-c', nazwa: 'Gamma' }),
  ]

  test('zmiana istniejacego makra zostawia je na tej samej pozycji', () => {
    const wynik = wstawLubZastap(lista, makro({ id: 'mac-b', nazwa: 'Beta poprawiona' }))

    expect(wynik.map((m) => m.id)).toEqual(['mac-a', 'mac-b', 'mac-c'])
    expect(wynik[1].nazwa).toBe('Beta poprawiona')
  })

  test('nowe makro laduje na koncu listy', () => {
    const wynik = wstawLubZastap(lista, makro({ id: 'mac-d', nazwa: 'Delta' }))

    expect(wynik.map((m) => m.id)).toEqual(['mac-a', 'mac-b', 'mac-c', 'mac-d'])
  })

  test('zrodlowa lista zostaje nietknieta', () => {
    wstawLubZastap(lista, makro({ id: 'mac-b', nazwa: 'Beta poprawiona' }))

    expect(lista[1].nazwa).toBe('Beta')
  })
})

describe('sprzatanie magazynu bez magazynu', () => {
  test('brak katalogu att nie jest bledem — nie ma czego sprzatac', async () => {
    const nieistniejacy = path.join(katalog, 'att-ktorego-nie-ma')

    expect(await usunOsierociZalaczniki(nieistniejacy, [])).toEqual([])
  })
})
