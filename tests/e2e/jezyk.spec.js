import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

let katalogDanych
let aplikacja
let okno

async function uruchom() {
  aplikacja = await electron.launch({ args: ['.', `--user-data-dir=${katalogDanych}`] })
  okno = await aplikacja.firstWindow()
  await okno.waitForSelector('body[data-gotowy="1"]')
}

test.beforeEach(async () => {
  katalogDanych = await mkdtemp(path.join(tmpdir(), 'msghub-jezyk-'))
  await uruchom()
})

test.afterEach(async () => {
  await aplikacja.close().catch(() => {})
  const sprzatanie = rm(katalogDanych, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([sprzatanie, new Promise((koniec) => setTimeout(koniec, 3000))])
})

async function wybierzJezyk(kod) {
  await okno.locator('#otworz-ustawienia').click()
  await okno.locator('#wybor-jezyka').selectOption(kod)
  await okno.locator('#zamknij-ustawienia').click()
}

test('swiezy profil startuje po angielsku', async () => {
  await expect(okno.locator('#dodaj-konto .etykieta-akcji')).toHaveText('Add account')
  await expect(okno.locator('.szyna-tytul')).toHaveText('Channels')
  await expect(okno.locator('#listwa-licznik')).toHaveText('all read')
  expect(await okno.evaluate(() => document.documentElement.lang)).toBe('en')
})

test('jezyk podpisuje sie wlasna nazwa, nie tlumaczeniem', async () => {
  await okno.locator('#otworz-ustawienia').click()
  await expect(okno.locator('#wybor-jezyka option')).toHaveText(['English', 'Polski'])
})

// Przeladowanie okna zerwaloby natywne widoki kont razem z zalogowaniem, wiec zmiana
// jezyka musi przemalowac interfejs W MIEJSCU — takze tresci rysowane z JS.
test('wybor polskiego przemalowuje takze tresc rysowana z JS', async () => {
  await wybierzJezyk('pl')

  await expect(okno.locator('#dodaj-konto .etykieta-akcji')).toHaveText('Dodaj konto')
  await expect(okno.locator('.szyna-tytul')).toHaveText('Kanały')
  // Listwa sklada ten napis sama, wiec zostalaby po angielsku, gdyby zmiana
  // dotykala wylacznie napisow zapisanych w HTML-u.
  await expect(okno.locator('#listwa-licznik')).toHaveText('wszystko przeczytane')
  await expect(okno.locator('#listwa-nazwa')).toHaveText('Brak kont')
  expect(await okno.evaluate(() => document.documentElement.lang)).toBe('pl')
})

test('wybrany jezyk przezywa restart aplikacji', async () => {
  await wybierzJezyk('pl')
  await aplikacja.close()

  await uruchom()

  await expect(okno.locator('.szyna-tytul')).toHaveText('Kanały')
  expect(await okno.evaluate(() => document.getElementById('wybor-jezyka').value)).toBe('pl')
})

test('uszkodzony jezyk w pliku ustawien nie wywraca startu', async () => {
  await okno.evaluate(() => window.mostHub.ustawJezyk('klingon'))
  await aplikacja.close()

  await uruchom()

  // Nieznany kod spada na domyslny zamiast pokazywac gole klucze tlumaczen.
  await expect(okno.locator('.szyna-tytul')).toHaveText('Channels')
})
