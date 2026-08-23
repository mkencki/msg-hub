import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

let katalogDanych
let aplikacja
let okno

test.beforeEach(async () => {
  katalogDanych = await mkdtemp(path.join(tmpdir(), 'msghub-makra-e2e-'))
  aplikacja = await electron.launch({ args: ['.', `--user-data-dir=${katalogDanych}`] })
  okno = await aplikacja.firstWindow()
})

test.afterEach(async () => {
  await aplikacja.close()
  const sprzatanie = rm(katalogDanych, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([sprzatanie, new Promise((koniec) => setTimeout(koniec, 3000))])
})

test('Ctrl+; otwiera panel makr, ktory na starcie jest pusty', async () => {
  await okno.keyboard.press('Control+Semicolon')

  await expect(okno.locator('#okno-makr')).toBeVisible()
  await expect(okno.locator('#lista-makr .puste')).toHaveText(/Brak makr/)
})

test('zapisane makro pojawia sie na liscie i daje sie wyszukac po tresci', async () => {
  await okno.evaluate(() =>
    window.mostHub.zapiszMakro({
      nazwa: 'Instrukcja Strefa Klienta',
      tekst: '*Jak dodac kierowce:*\n- Zaloguj sie\n- Wejdz w Kierowcy',
    }),
  )
  await okno.evaluate(() =>
    window.mostHub.zapiszMakro({ nazwa: 'Passango', tekst: 'instalacja urzadzenia' }),
  )

  await okno.keyboard.press('Control+Semicolon')
  await expect(okno.locator('#lista-makr li')).toHaveCount(2)

  // Wyszukiwarka ma siegac tresci, nie tylko nazwy — fraza wystepuje tylko w tresci.
  await okno.locator('#szukaj-makro').fill('kierowce')
  await expect(okno.locator('#lista-makr li')).toHaveCount(1)
  await expect(okno.locator('#lista-makr li')).toHaveText(/Strefa Klienta/)
})

test('wybor makra kladzie tekst w schowku i nie wysyla wiadomosci', async () => {
  // Konto zakladamy przez ten sam formularz, ktorego uzywa operator.
  await okno.locator('#dodaj-konto').click()
  await okno.locator('#okno-konta input[name="nazwa"]').fill('WhatsApp testowy')
  await okno.locator('#zapisz-konto').click()
  await expect(okno.locator('.zakladka')).toHaveCount(1)

  const tresc = '*Jak dodac kierowce:*\n- Zaloguj sie'
  await okno.evaluate(
    (tekst) => window.mostHub.zapiszMakro({ nazwa: 'Strefa', tekst }),
    tresc,
  )

  await aplikacja.evaluate(({ clipboard }) => clipboard.writeText('wartosc-sprzed-wstawienia'))

  await okno.keyboard.press('Control+Semicolon')
  await okno.locator('#lista-makr li').first().click()

  const wSchowku = await aplikacja.evaluate(({ clipboard }) => clipboard.readText())
  expect(wSchowku).toBe(tresc)

  // Regula 7.1 (brak sciezki wysylki) jest pilnowana testami jednostkowymi
  // w tests/wstawianie.test.js i tests/granice.test.js.
})
