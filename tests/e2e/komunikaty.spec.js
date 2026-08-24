import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

let katalogDanych
let aplikacja
let okno

test.beforeEach(async () => {
  katalogDanych = await mkdtemp(path.join(tmpdir(), 'msghub-komunikaty-'))
  aplikacja = await electron.launch({ args: ['.', `--user-data-dir=${katalogDanych}`] })
  okno = await aplikacja.firstWindow()
  await okno.waitForSelector('body[data-gotowy="1"]')
})

test.afterEach(async () => {
  await aplikacja.evaluate(({ clipboard }) => clipboard.clear()).catch(() => {})
  await aplikacja.close().catch(() => {})
  const sprzatanie = rm(katalogDanych, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([sprzatanie, new Promise((koniec) => setTimeout(koniec, 3000))])
})

async function dodajKonto() {
  await okno.locator('#dodaj-konto').click()
  await okno.locator('#okno-konta input[name="nazwa"]').fill('Konto testowe')
  await okno.locator('#zapisz-konto').click()
  await expect(okno.locator('.kanal')).toHaveCount(1)
}

// Ciche niepowodzenie jest gorsze od widocznego bledu: panel znika przy kazdym
// wyborze, wiec brak wstawienia wyglada dokladnie jak udane wstawienie.
test('makro klikniete bez zadnego konta mowi, ze nie ma dokad wstawiac', async () => {
  await okno.evaluate(() => window.mostHub.zapiszMakro({ nazwa: 'Makro', tekst: 'tresc' }))

  await okno.locator('#otworz-makra').click()
  await okno.locator('#lista-makr li').first().click()

  await expect(okno.locator('#komunikat')).toBeVisible()
  await expect(okno.locator('#komunikat')).toHaveText(/konto/i)
})

test('makro bez tresci i bez zalacznika zglasza, ze nie ma czego wstawic', async () => {
  await dodajKonto()
  await okno.evaluate(() => window.mostHub.zapiszMakro({ nazwa: 'Makro puste', tekst: '' }))

  await okno.locator('#otworz-makra').click()
  await okno.locator('#lista-makr li').first().click()

  await expect(okno.locator('#komunikat')).toBeVisible()
  await expect(okno.locator('#komunikat')).toHaveText(/ani tresci, ani zalacznika/i)
})

// Pasek na gorze lezy POZA oknem dialogowym, a modal unieruchamia wszystko wokol
// siebie. Blad zglaszany przez otwarty edytor musi zostac w edytorze — inaczej
// operator widzi czerwony tekst, ktorego nie moze ani zamknac, ani powiazac z polem.
test('blad zapisu makra zostaje w edytorze, nie ucieka do paska nad modalem', async () => {
  await okno.locator('#otworz-makra').click()
  await okno.locator('#nowe-makro').click()
  await okno.locator('#zapisz-makro').click()

  await expect(okno.locator('#bledy-makra')).toHaveText(/nazwa jest wymagana/)
  await expect(okno.locator('#komunikat')).toBeHidden()
})

test('udany zapis kasuje blad pokazany przy poprzedniej probie', async () => {
  await okno.locator('#otworz-makra').click()
  await okno.locator('#nowe-makro').click()
  await okno.locator('#zapisz-makro').click()
  await expect(okno.locator('#bledy-makra')).toHaveText(/nazwa jest wymagana/)

  await okno.locator('#edytor-nazwa').fill('Teraz z nazwa')
  await okno.locator('#zapisz-makro').click()
  await expect(okno.locator('#okno-edytora')).toBeHidden()

  await okno.locator('#otworz-makra').click()
  await okno.locator('#nowe-makro').click()
  await expect(okno.locator('#bledy-makra')).toHaveText('')
})

test('komunikat w pasku da sie zamknac przyciskiem', async () => {
  await okno.evaluate(() => window.mostHub.zapiszMakro({ nazwa: 'Makro', tekst: 'tresc' }))
  await okno.locator('#otworz-makra').click()
  await okno.locator('#lista-makr li').first().click()
  await expect(okno.locator('#komunikat')).toBeVisible()

  await okno.locator('#zamknij-komunikat').click()

  await expect(okno.locator('#komunikat')).toBeHidden()
})

// Atrybut hidden dziala regula [hidden] { display: none } z arkusza przegladarki.
// Kazde autorskie display na tym samym elemencie ja bije i pasek zostaje widoczny
// mimo hidden — pulapka, ktora tu juz raz wpadlismy.
test('pasek z atrybutem hidden jest naprawde niewidoczny', async () => {
  const wyliczony = await okno.evaluate(
    () => getComputedStyle(document.getElementById('komunikat')).display,
  )

  expect(wyliczony).toBe('none')
})
