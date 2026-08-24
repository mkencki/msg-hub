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
  await okno.waitForSelector('body[data-gotowy="1"]')
})

test.afterEach(async () => {
  await aplikacja.close()
  const sprzatanie = rm(katalogDanych, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([sprzatanie, new Promise((koniec) => setTimeout(koniec, 3000))])
})

test('Ctrl+; otwiera panel makr, ktory na starcie jest pusty', async () => {
  await okno.keyboard.press('Control+Semicolon')

  await expect(okno.locator('#okno-makr')).toBeVisible()
  await expect(okno.locator('#lista-makr .puste')).toHaveText(/No macros/)
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
  await expect(okno.locator('.kanal')).toHaveCount(1)

  const tresc = '*Jak dodac kierowce:*\n- Zaloguj sie'
  await okno.evaluate(
    (tekst) => window.mostHub.zapiszMakro({ nazwa: 'Strefa', tekst }),
    tresc,
  )

  await aplikacja.evaluate(({ clipboard }) => clipboard.writeText('wartosc-sprzed-wstawienia'))

  await okno.keyboard.press('Control+Semicolon')
  await okno.locator('#lista-makr li').first().click()

  // Panel znika PRZED zakonczeniem wstawiania — wstawMakro() zamyka okno, a dopiero
  // potem czeka na proces glowny. Jego zniknieciem nie da sie wiec mierzyc konca
  // operacji; sygnalem jest meldunek na listwie, ktory zapada po rozwiazaniu IPC.
  await expect(okno.locator('#komunikat')).toBeVisible()

  const wSchowku = await aplikacja.evaluate(({ clipboard }) => clipboard.readText())
  expect(wSchowku).toBe(tresc)

  // Regula 7.1 (brak sciezki wysylki) jest pilnowana testami jednostkowymi
  // w tests/wstawianie.test.js i tests/granice.test.js.
})

test('edytor formatuje tekst, pokazuje podglad i zapisuje makro', async () => {
  await okno.keyboard.press('Control+Semicolon')
  await okno.locator('#nowe-makro').click()
  await expect(okno.locator('#okno-edytora')).toBeVisible()

  await okno.locator('#edytor-nazwa').fill('Instrukcja Strefa Klienta')
  await okno.locator('#edytor-tekst').fill('Jak dodac kierowce:\nZaloguj sie')

  // Pasek formatowania dziala na linii, w ktorej stoi kursor.
  await okno.locator('#edytor-tekst').click()
  await okno.keyboard.press('Control+Home')
  await okno.locator('#pasek-formatowania button[data-prefiks="- "]').click()

  await expect(okno.locator('#edytor-tekst')).toHaveValue('- Jak dodac kierowce:\nZaloguj sie')

  // Podglad ma pokazac punkt listy, a nie surowy myslnik.
  await expect(okno.locator('#edytor-podglad li')).toHaveText('Jak dodac kierowce:')

  await okno.locator('#zapisz-makro').click()
  await expect(okno.locator('#okno-edytora')).toBeHidden()

  await okno.keyboard.press('Control+Semicolon')
  await expect(okno.locator('#lista-makr li')).toHaveText(/Instrukcja Strefa Klienta/)
})

test('podglad nie wykonuje kodu HTML wklejonego do tresci makra', async () => {
  await okno.keyboard.press('Control+Semicolon')
  await okno.locator('#nowe-makro').click()
  await okno.locator('#edytor-tekst').fill('<img src=x onerror="window.zlamane=1">')

  await expect(okno.locator('#edytor-podglad img')).toHaveCount(0)
  expect(await okno.evaluate(() => window.zlamane)).toBeUndefined()
})

test('makro bez nazwy jest odrzucane z komunikatem', async () => {
  await okno.keyboard.press('Control+Semicolon')
  await okno.locator('#nowe-makro').click()
  await okno.locator('#edytor-tekst').fill('tresc bez nazwy')
  await okno.locator('#zapisz-makro').click()

  // Blad zostaje w edytorze — gorny pasek lezy poza modalem i bylby nieklikalny.
  await expect(okno.locator('#bledy-makra')).toHaveText(/name is required/)
})
