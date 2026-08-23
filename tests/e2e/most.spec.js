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
  await rm(katalogDanych, { recursive: true, force: true })
})

test('okno renderuje pasek zakladek i wystawia most do renderera', async () => {
  const aplikacja = await electron.launch({ args: ['.', `--user-data-dir=${katalogDanych}`] })
  const okno = await aplikacja.firstWindow()

  expect(await okno.title()).toBe('msg-hub')
  await expect(okno.locator('#zakladki')).toBeAttached()
  await expect(okno.locator('#dodaj-konto')).toBeVisible()

  const metody = await okno.evaluate(() => Object.keys(window.mostHub ?? {}).sort())
  expect(metody).toEqual(['dodajKonto', 'listaKont', 'przelacz'])

  // Swiezy katalog danych: brak kont, a kanal IPC odpowiada zamiast rzucac.
  const konta = await okno.evaluate(() => window.mostHub.listaKont())
  expect(konta).toEqual([])

  await aplikacja.close()
})
