import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

// Geometria z src/glowny/main.js. Widok konta zaczyna sie tuz za szyna,
// wiec jego x jest najprostszym dowodem, ile miejsca szyna naprawde zabiera.
const ZWINIETA = 48
const ROZWINIETA = 162
const MARGINES = 10

let katalogDanych
let aplikacja
let okno

async function otworzAplikacje() {
  aplikacja = await electron.launch({ args: ['.', `--user-data-dir=${katalogDanych}`] })
  okno = await aplikacja.firstWindow()
  await okno.waitForSelector('body[data-gotowy="1"]')
}

async function dodajKonto(nazwa = 'WhatsApp testowy') {
  await okno.locator('#dodaj-konto').click()
  await okno.locator('#okno-konta input[name="nazwa"]').fill(nazwa)
  await okno.locator('#zapisz-konto').click()
  await expect(okno.locator('#okno-konta')).toBeHidden()
}

const lewaKrawedzWidoku = () =>
  aplikacja.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    return w.contentView.children.find((v) => v.getBounds().height > 0)?.getBounds().x ?? null
  })

test.beforeEach(async () => {
  katalogDanych = await mkdtemp(path.join(tmpdir(), 'msghub-szyna-'))
  await otworzAplikacje()
})

test.afterEach(async () => {
  await aplikacja.close().catch(() => {})
  const sprzatanie = rm(katalogDanych, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([sprzatanie, new Promise((koniec) => setTimeout(koniec, 3000))])
})

test('szyna startuje zwinieta, wiec widok konta dostaje wiecej miejsca', async () => {
  await dodajKonto()

  // Poll, nie goly odczyt. Kanal pojawia sie w szynie, gdy renderer dostanie liste
  // kont, ale natywny widok tworzy dopiero proces glowny w odpowiedzi na przelaczenie —
  // miedzy jednym a drugim jest okno, w ktorym children jest jeszcze puste.
  await expect.poll(lewaKrawedzWidoku).toBe(ZWINIETA + MARGINES)
})

test('najechanie kursorem rozwija szyne i odsuwa widok konta', async () => {
  await dodajKonto()

  await okno.locator('#szyna').hover()

  await expect.poll(lewaKrawedzWidoku).toBe(ROZWINIETA + MARGINES)
  await expect(okno.locator('.kanal-nazwa')).toBeVisible()
})

test('zjechanie kursorem zwija szyne z powrotem', async () => {
  await dodajKonto()
  await okno.locator('#szyna').hover()
  await expect.poll(lewaKrawedzWidoku).toBe(ROZWINIETA + MARGINES)

  await okno.locator('#listwa').hover()

  await expect.poll(lewaKrawedzWidoku).toBe(ZWINIETA + MARGINES)
})

test('przypieta szyna zostaje rozwinieta po zjechaniu kursorem', async () => {
  await dodajKonto()
  await okno.locator('#szyna').hover()
  await okno.locator('#przypnij-szyne').click()

  await okno.locator('#listwa').hover()

  await expect.poll(lewaKrawedzWidoku).toBe(ROZWINIETA + MARGINES)
})

test('odpiecie wraca do zwijania', async () => {
  await dodajKonto()
  await okno.locator('#szyna').hover()
  await okno.locator('#przypnij-szyne').click()
  await expect.poll(lewaKrawedzWidoku).toBe(ROZWINIETA + MARGINES)

  await okno.locator('#przypnij-szyne').click()
  await okno.locator('#listwa').hover()

  await expect.poll(lewaKrawedzWidoku).toBe(ZWINIETA + MARGINES)
})

test('przypiecie przezywa zamkniecie aplikacji', async () => {
  await dodajKonto()
  await okno.locator('#szyna').hover()
  await okno.locator('#przypnij-szyne').click()
  await expect.poll(lewaKrawedzWidoku).toBe(ROZWINIETA + MARGINES)
  await aplikacja.close()

  await otworzAplikacje()

  await expect.poll(lewaKrawedzWidoku).toBe(ROZWINIETA + MARGINES)
  await expect(okno.locator('#szyna')).toHaveClass(/przypieta/)
})

// Zwiniecie nie moze zabrac tego, po co szyna istnieje: rozroznienia kont.
test('zwinieta szyna nadal niesie kolor kanalu', async () => {
  await dodajKonto()

  await expect(okno.locator('.kanal .chip')).toBeVisible()
  await expect(okno.locator('.kanal-nazwa')).toBeHidden()
})
