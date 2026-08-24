import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import path from 'node:path'

const uruchom = promisify(execFile)

// Materialy test generuje SAM. Wczesniej siegal po pliki z prywatnego dysku autora,
// przez co przechodzil wylacznie na jednej maszynie — na runnerze CI konczyl sie
// ENOENT-em, a w publicznym repozytorium zdradzalby cudza strukture katalogow.
//
// Dla tego testu zawartosc pliku nie ma znaczenia: CF_HDROP niesie SCIEZKE, nie bajty.
// Mimo to pliki sa prawdziwymi, minimalnymi dokumentami swojego formatu — plik nazwany
// .pdf, ktory nie jest PDF-em, to pulapka na kogos, kto kiedys dolozy tu walidacje typu.
const PRZYKLADOWY_PDF = Buffer.from(
  `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Resources<<>>>>endobj
trailer<</Size 4/Root 1 0 R>>
%%EOF
`,
  'latin1',
)

const PRZYKLADOWY_MP4 = Buffer.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70,
  0x6d, 0x70, 0x34, 0x32, 0x00, 0x00, 0x00, 0x00,
  0x6d, 0x70, 0x34, 0x32, 0x69, 0x73, 0x6f, 0x6d,
  0x00, 0x00, 0x00, 0x08, 0x6d, 0x64, 0x61, 0x74,
])

const MATERIALY = [
  { typ: 'PDF', nazwa: 'instrukcja instalacji.pdf', bajty: PRZYKLADOWY_PDF },
  { typ: 'mp4', nazwa: 'przewodnik wideo.mp4', bajty: PRZYKLADOWY_MP4 },
]

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
  await expect(okno.locator('.kanal')).toHaveCount(1)
})

test.afterEach(async () => {
  // Schowek trzyma uchwyt do wklejonego pliku — bez wyczyszczenia katalog
  // tymczasowy zostaje zablokowany i nastepny test czeka na zwolnienie.
  await aplikacja.evaluate(({ clipboard }) => clipboard.clear()).catch(() => {})
  await aplikacja.close()
  const sprzatanie = rm(katalogDanych, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([sprzatanie, new Promise((koniec) => setTimeout(koniec, 3000))])
})

for (const material of MATERIALY) {
  test(`makro z zalacznikiem ${material.typ} kladzie plik w schowku Windows jako CF_HDROP`, async () => {
    const att = path.join(katalogDanych, 'att')
    await mkdir(att, { recursive: true })
    const nazwaWMagazynie = `11111111-2222-3333-4444-555555555555-${material.nazwa}`
    await writeFile(path.join(att, nazwaWMagazynie), material.bajty)

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
    // Plik jest w schowku PO tekscie — makro wstawia najpierw tresc, potem zalacznik.
    expect(await plikiWSchowku()).toEqual([nazwaWMagazynie])
  })
}

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
