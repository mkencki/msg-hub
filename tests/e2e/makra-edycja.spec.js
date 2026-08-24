import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm, mkdir, writeFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

let katalogDanych
let aplikacja
let okno

test.beforeEach(async () => {
  katalogDanych = await mkdtemp(path.join(tmpdir(), 'msghub-makra-edycja-'))
  aplikacja = await electron.launch({ args: ['.', `--user-data-dir=${katalogDanych}`] })
  okno = await aplikacja.firstWindow()
  await okno.waitForSelector('body[data-gotowy="1"]')
})

test.afterEach(async () => {
  await aplikacja.close()
  const sprzatanie = rm(katalogDanych, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([sprzatanie, new Promise((koniec) => setTimeout(koniec, 3000))])
})

async function dodajMakro(nazwa, tekst, zalaczniki = []) {
  await okno.evaluate(
    (dane) => window.mostHub.zapiszMakro(dane),
    { nazwa, tekst, zalaczniki },
  )
}

// Zalacznik kladziemy prosto w magazynie — okno wyboru pliku jest natywne
// i nie da sie go wyklikac z testu.
async function wstawDoMagazynu(nazwaPliku) {
  const att = path.join(katalogDanych, 'att')
  await mkdir(att, { recursive: true })
  const wMagazynie = `11111111-2222-3333-4444-555555555555-${nazwaPliku}`
  await writeFile(path.join(att, wMagazynie), 'zawartosc testowa')
  return `att/${wMagazynie}`
}

test('Edytuj otwiera edytor wypelniony trescia istniejacego makra', async () => {
  await dodajMakro('Instrukcja Strefa Klienta', '*Jak dodac kierowce:*')

  await okno.keyboard.press('Control+Semicolon')
  await okno.locator('#lista-makr li .edytuj-makro').click()

  await expect(okno.locator('#okno-edytora')).toBeVisible()
  await expect(okno.locator('#edytor-nazwa')).toHaveValue('Instrukcja Strefa Klienta')
  await expect(okno.locator('#edytor-tekst')).toHaveValue('*Jak dodac kierowce:*')
})

test('zapis po edycji nadpisuje makro zamiast tworzyc drugie', async () => {
  await dodajMakro('Instrukcja Strefa Klienta', 'stara tresc')

  await okno.keyboard.press('Control+Semicolon')
  await okno.locator('#lista-makr li .edytuj-makro').click()
  await okno.locator('#edytor-tekst').fill('nowa tresc')
  await okno.locator('#zapisz-makro').click()

  const makra = await okno.evaluate(() => window.mostHub.listaMakr(''))
  expect(makra).toHaveLength(1)
  expect(makra[0].tekst).toBe('nowa tresc')
})

test('edycja nie przerzuca makra na koniec listy', async () => {
  await dodajMakro('Alfa', 'a')
  await dodajMakro('Beta', 'b')
  await dodajMakro('Gamma', 'c')

  await okno.keyboard.press('Control+Semicolon')
  await okno.locator('#lista-makr li', { hasText: 'Beta' }).locator('.edytuj-makro').click()
  await okno.locator('#edytor-tekst').fill('b poprawione')
  await okno.locator('#zapisz-makro').click()

  const makra = await okno.evaluate(() => window.mostHub.listaMakr(''))
  expect(makra.map((m) => m.nazwa)).toEqual(['Alfa', 'Beta', 'Gamma'])
})

test('anulowane usuwanie zostawia makro na liscie', async () => {
  await dodajMakro('Instrukcja Strefa Klienta', 'tresc')

  await okno.keyboard.press('Control+Semicolon')
  await okno.locator('#lista-makr li .usun-makro').click()
  await expect(okno.locator('#okno-usuwania-makra')).toBeVisible()
  await okno.locator('#anuluj-usuniecie-makra').click()

  await expect(okno.locator('#lista-makr li')).toHaveCount(1)
  expect(await okno.evaluate(() => window.mostHub.listaMakr(''))).toHaveLength(1)
})

test('potwierdzone usuniecie zdejmuje makro i kasuje jego zalacznik z magazynu', async () => {
  const wzgledna = await wstawDoMagazynu('PASSango - instrukcja.mp4')
  await dodajMakro('Instalacja Passango', 'tresc', [wzgledna])

  await okno.keyboard.press('Control+Semicolon')
  await okno.locator('#lista-makr li .usun-makro').click()
  await okno.locator('#potwierdz-usuniecie-makra').click()

  await expect(okno.locator('#lista-makr .puste')).toHaveText(/Brak makr/)
  expect(await okno.evaluate(() => window.mostHub.listaMakr(''))).toHaveLength(0)

  // Bez sprzatania magazynu plik 4 MB zostalby na dysku na zawsze.
  expect(await readdir(path.join(katalogDanych, 'att'))).toEqual([])
})

test('zalacznik da sie zdjac z makra w edytorze', async () => {
  const wzgledna = await wstawDoMagazynu('PASSango - instrukcja.mp4')
  await dodajMakro('Instalacja Passango', 'tresc', [wzgledna])

  await okno.keyboard.press('Control+Semicolon')
  await okno.locator('#lista-makr li .edytuj-makro').click()
  await expect(okno.locator('#lista-zalacznikow .zdejmij-zalacznik')).toHaveCount(1)

  await okno.locator('#lista-zalacznikow li .zdejmij-zalacznik').click()
  await okno.locator('#zapisz-makro').click()

  const makra = await okno.evaluate(() => window.mostHub.listaMakr(''))
  expect(makra[0].zalaczniki).toEqual([])
  expect(await readdir(path.join(katalogDanych, 'att'))).toEqual([])
})
