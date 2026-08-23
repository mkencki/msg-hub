import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

let katalogDanych

test.beforeEach(async () => {
  // Wlasny katalog danych — test nie moze dotknac prawdziwego accounts.json operatora.
  katalogDanych = await mkdtemp(path.join(tmpdir(), 'msghub-e2e-'))
})

test.afterEach(async () => {
  // Windows zwalnia uchwyty po procesie Electrona z opoznieniem. Sprzatanie jest
  // uprzejmoscia wobec katalogu tymczasowego, nie asercja — nie moze blokowac testu.
  const sprzatanie = rm(katalogDanych, { recursive: true, force: true, maxRetries: 3 }).catch(
    () => {},
  )
  await Promise.race([sprzatanie, new Promise((koniec) => setTimeout(koniec, 3000))])
})

test('okno renderuje pasek zakladek i wystawia most do renderera', async () => {
  const aplikacja = await electron.launch({ args: ['.', `--user-data-dir=${katalogDanych}`] })
  const okno = await aplikacja.firstWindow()

  expect(await okno.title()).toBe('msg-hub')
  await expect(okno.locator('#zakladki')).toBeAttached()
  await expect(okno.locator('#dodaj-konto')).toBeVisible()

  const metody = await okno.evaluate(() => Object.keys(window.mostHub ?? {}).sort())
  expect(metody).toEqual(
    expect.arrayContaining(['dodajKonto', 'listaKont', 'naKomunikat', 'naLicznik', 'przelacz', 'ustawNakladke']),
  )

  // Swiezy katalog danych: brak kont, a kanal IPC odpowiada zamiast rzucac.
  const konta = await okno.evaluate(() => window.mostHub.listaKont())
  expect(konta).toEqual([])

  await aplikacja.close()
})

test('licznik rysuje nakladke 16x16 i znika przy zerze', async () => {
  const aplikacja = await electron.launch({ args: ['.', `--user-data-dir=${katalogDanych}`] })
  const okno = await aplikacja.firstWindow()

  const wynik = await okno.evaluate(async () => {
    const { narysujLicznik } = await import('./renderer.js')
    return { zero: narysujLicznik(0), trzy: narysujLicznik(3), duzo: narysujLicznik(120) }
  })

  expect(wynik.zero).toBeNull()
  expect(wynik.trzy).toMatch(/^data:image\/png;base64,/)
  expect(wynik.duzo).toMatch(/^data:image\/png;base64,/)

  // Proces glowny musi przyjac narysowany obrazek — setOverlayIcon odrzuca smiecie.
  await okno.evaluate((obrazek) => window.mostHub.ustawNakladke(obrazek), wynik.trzy)
  await okno.evaluate(() => window.mostHub.ustawNakladke(null))

  await aplikacja.close()
})

test('renderer wczytuje konta juz przy starcie, bez wyscigu z rejestracja IPC', async () => {
  const aplikacja = await electron.launch({ args: ['.', `--user-data-dir=${katalogDanych}`] })
  const okno = await aplikacja.firstWindow()

  // Renderer wola konta:lista natychmiast po zaladowaniu. Jesli proces glowny
  // rejestruje kanaly pozniej, wywolanie rzuca i pasek zostaje pusty.
  await expect(okno.locator('#komunikat')).toBeHidden()
  expect(await okno.locator('#komunikat').textContent()).toBe('')

  await aplikacja.close()
})
