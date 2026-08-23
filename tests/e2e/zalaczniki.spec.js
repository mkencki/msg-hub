import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm, mkdir, copyFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import path from 'node:path'

const uruchom = promisify(execFile)

const ZRODLO_PDF = path.join(
  'C:/Users/marek/OneDrive - AS24',
  '03. AS24 DOCS',
  'DOKUMENTY AS24',
  '2. PASSANGO',
  'DODATKOWE PLIKI',
  'PASSango - instalacja.pdf',
)

let katalogDanych
let aplikacja
let okno

// Odczyt ARTEFAKTU: co naprawde lezy w schowku Windows. Kod powrotu nie wystarcza —
// Set-Clipboard moze zwrocic sukces, a schowek zostac pusty.
async function plikiWSchowku() {
  const { stdout } = await uruchom(
    'powershell.exe',
    [
      '-NoProfile',
      '-STA',
      '-Command',
      '$l = Get-Clipboard -Format FileDropList; if ($l) { $l | ForEach-Object { $_.Name } }',
    ],
    { windowsHide: true },
  )
  return stdout.trim().split('\n').map((w) => w.trim()).filter(Boolean)
}

test.beforeEach(async () => {
  katalogDanych = await mkdtemp(path.join(tmpdir(), 'msghub-zal-'))
  aplikacja = await electron.launch({ args: ['.', `--user-data-dir=${katalogDanych}`] })
  okno = await aplikacja.firstWindow()
  await okno.waitForSelector('body[data-gotowy="1"]')

  // Konto zakladamy przez formularz — bez aktywnego widoku nie ma gdzie wstawiac.
  await okno.locator('#dodaj-konto').click()
  await okno.locator('#okno-konta input[name="nazwa"]').fill('WhatsApp testowy')
  await okno.locator('#zapisz-konto').click()
  await expect(okno.locator('.zakladka')).toHaveCount(1)
})

test.afterEach(async () => {
  await aplikacja.close()
  const sprzatanie = rm(katalogDanych, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([sprzatanie, new Promise((koniec) => setTimeout(koniec, 3000))])
})

test('makro z PDF kladzie plik w schowku Windows jako CF_HDROP', async () => {
  const att = path.join(katalogDanych, 'att')
  await mkdir(att, { recursive: true })
  const nazwaWMagazynie = '11111111-2222-3333-4444-555555555555-PASSango - instalacja.pdf'
  await copyFile(ZRODLO_PDF, path.join(att, nazwaWMagazynie))

  await okno.evaluate(
    (wzgledna) =>
      window.mostHub.zapiszMakro({
        nazwa: 'Instalacja Passango',
        tekst: '*Instrukcja instalacji:*',
        zalaczniki: [wzgledna],
      }),
    `att/${nazwaWMagazynie}`,
  )

  // Schowek celowo zaczyna od czegos innego, zeby wynik nie byl przypadkiem.
  await aplikacja.evaluate(({ clipboard }) => clipboard.writeText('stan-poczatkowy'))

  const wynik = await okno.evaluate(async () => {
    const makra = await window.mostHub.listaMakr('')
    return window.mostHub.wstawMakro(makra[0].id)
  })

  expect(wynik.ok).toBe(true)
  expect(wynik.brakujace).toEqual([])
  expect(await plikiWSchowku()).toEqual([nazwaWMagazynie])
})

test('brak pliku w magazynie nie wywraca makra — tekst dziala, brak jest zgloszony', async () => {
  await okno.evaluate(() =>
    window.mostHub.zapiszMakro({
      nazwa: 'Makro z sierota',
      tekst: '*Tresc dziala mimo braku pliku*',
      zalaczniki: ['att/nie-ma-takiego-pliku.pdf'],
    }),
  )

  await aplikacja.evaluate(({ clipboard }) => clipboard.writeText('stan-poczatkowy'))

  const wynik = await okno.evaluate(async () => {
    const makra = await window.mostHub.listaMakr('')
    return window.mostHub.wstawMakro(makra[0].id)
  })

  expect(wynik.ok).toBe(false)
  expect(wynik.brakujace).toEqual(['att/nie-ma-takiego-pliku.pdf'])

  // Tekst mimo to trafil do schowka — spec sekcja 8.
  const wSchowku = await aplikacja.evaluate(({ clipboard }) => clipboard.readText())
  expect(wSchowku).toBe('*Tresc dziala mimo braku pliku*')
})
