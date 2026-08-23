import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { wczytajUklad, zapiszUklad, UKLAD_DOMYSLNY } from '../src/glowny/powloka.js'

let plik, katalog

beforeEach(async () => {
  katalog = await mkdtemp(path.join(tmpdir(), 'msghub-uklad-'))
  plik = path.join(katalog, 'uklad.json')
})

afterEach(async () => {
  await rm(katalog, { recursive: true, force: true })
})

describe('uklad okna', () => {
  test('brak pliku daje uklad domyslny', async () => {
    expect(await wczytajUklad(plik)).toEqual(UKLAD_DOMYSLNY)
  })

  test('uklad przezywa zapis i odczyt', async () => {
    await zapiszUklad(plik, { x: 100, y: 50, szerokosc: 1000, wysokosc: 700, zmaksymalizowane: false })
    const wynik = await wczytajUklad(plik)
    expect(wynik.szerokosc).toBe(1000)
    expect(wynik.x).toBe(100)
  })

  test('uszkodzony plik daje uklad domyslny zamiast wyjatku', async () => {
    await writeFile(plik, 'nie-json', 'utf8')
    expect(await wczytajUklad(plik)).toEqual(UKLAD_DOMYSLNY)
  })

  test('absurdalne rozmiary sa przycinane do minimum', async () => {
    await zapiszUklad(plik, { szerokosc: 10, wysokosc: 10, zmaksymalizowane: false })
    const wynik = await wczytajUklad(plik)
    expect(wynik.szerokosc).toBeGreaterThanOrEqual(800)
    expect(wynik.wysokosc).toBeGreaterThanOrEqual(600)
  })
})
