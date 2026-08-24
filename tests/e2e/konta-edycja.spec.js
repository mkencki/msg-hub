import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

let katalogDanych
let aplikacja
let okno

async function zapisaneKonta() {
  const tresc = await readFile(path.join(katalogDanych, 'accounts.json'), 'utf8')
  return JSON.parse(tresc).konta
}

async function dodajKonto(nazwa, platforma) {
  await okno.locator('#dodaj-konto').click()
  await okno.locator('#okno-konta input[name="nazwa"]').fill(nazwa)
  await okno.locator('#okno-konta select[name="platforma"]').selectOption(platforma)
  await okno.locator('#zapisz-konto').click()
  await expect(okno.locator('#okno-konta')).toBeHidden()
}

function wierszKonta(nazwa) {
  return okno.locator('#lista-kont li', { hasText: nazwa })
}

test.beforeEach(async () => {
  katalogDanych = await mkdtemp(path.join(tmpdir(), 'msghub-konta-edycja-'))
  aplikacja = await electron.launch({ args: ['.', `--user-data-dir=${katalogDanych}`] })
  okno = await aplikacja.firstWindow()
  await okno.waitForSelector('body[data-gotowy="1"]')

  await dodajKonto('Messenger', 'messenger')
  await dodajKonto('WhatsApp prywatny', 'whatsapp')
  await dodajKonto('WhatsApp sluzbowy', 'whatsapp')
  await expect(okno.locator('.kanal')).toHaveCount(3)
})

test.afterEach(async () => {
  await aplikacja.close().catch(() => {})
  const sprzatanie = rm(katalogDanych, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([sprzatanie, new Promise((koniec) => setTimeout(koniec, 3000))])
})

test('Edytuj otwiera formularz wypelniony danymi konta', async () => {
  await okno.locator('#otworz-ustawienia').click()
  await wierszKonta('WhatsApp prywatny').locator('.edytuj-konto').click()

  await expect(okno.locator('#okno-konta')).toBeVisible()
  await expect(okno.locator('#okno-konta input[name="nazwa"]')).toHaveValue('WhatsApp prywatny')
})

test('zmiana nazwy poprawia zakladke i nie tworzy drugiego konta', async () => {
  await okno.locator('#otworz-ustawienia').click()
  await wierszKonta('WhatsApp prywatny').locator('.edytuj-konto').click()
  await okno.locator('#okno-konta input[name="nazwa"]').fill('WhatsApp dom')
  await okno.locator('#zapisz-konto').click()

  await expect(okno.locator('.kanal')).toHaveCount(3)
  await expect(okno.locator('.kanal').nth(1).locator('.kanal-nazwa')).toHaveText('WhatsApp dom')
})

test('zmiana nazwy nie rusza id konta, wiec zalogowanie zostaje', async () => {
  const przed = (await zapisaneKonta())[1].id

  await okno.locator('#otworz-ustawienia').click()
  await wierszKonta('WhatsApp prywatny').locator('.edytuj-konto').click()
  await okno.locator('#okno-konta input[name="nazwa"]').fill('WhatsApp dom')
  await okno.locator('#zapisz-konto').click()
  await expect(okno.locator('.kanal').nth(1).locator('.kanal-nazwa')).toHaveText('WhatsApp dom')

  const po = await zapisaneKonta()
  expect(po[1].id).toBe(przed)
  expect(po[1].nazwa).toBe('WhatsApp dom')
})

test('edycja nie pozwala podmienic platformy, bo to inna sesja i inny adres', async () => {
  await okno.locator('#otworz-ustawienia').click()
  await wierszKonta('WhatsApp prywatny').locator('.edytuj-konto').click()

  await expect(okno.locator('#okno-konta select[name="platforma"]')).toBeDisabled()
})

test('pusta nazwa przy edycji jest odrzucana z komunikatem', async () => {
  await okno.locator('#otworz-ustawienia').click()
  await wierszKonta('WhatsApp prywatny').locator('.edytuj-konto').click()
  await okno.locator('#okno-konta input[name="nazwa"]').fill('   ')
  await okno.locator('#zapisz-konto').click()

  await expect(okno.locator('#bledy-konta')).toHaveText(/nazwa jest wymagana/)
  expect((await zapisaneKonta())[1].nazwa).toBe('WhatsApp prywatny')
})

test('przycisk w gore zmienia kolejnosc zakladek i zapisuje ja', async () => {
  await okno.locator('#otworz-ustawienia').click()
  await wierszKonta('WhatsApp sluzbowy').locator('.w-gore').click()

  await expect(okno.locator('.kanal').nth(1).locator('.kanal-nazwa')).toHaveText('WhatsApp sluzbowy')
  expect((await zapisaneKonta()).map((k) => k.nazwa)).toEqual([
    'Messenger',
    'WhatsApp sluzbowy',
    'WhatsApp prywatny',
  ])
})

test('przycisk w dol zmienia kolejnosc zakladek', async () => {
  await okno.locator('#otworz-ustawienia').click()
  await wierszKonta('Messenger').locator('.w-dol').click()

  await expect(okno.locator('.kanal').first().locator('.kanal-nazwa')).toHaveText('WhatsApp prywatny')
  expect((await zapisaneKonta()).map((k) => k.nazwa)).toEqual([
    'WhatsApp prywatny',
    'Messenger',
    'WhatsApp sluzbowy',
  ])
})

test('krance listy maja wylaczone przyciski przesuwania', async () => {
  await okno.locator('#otworz-ustawienia').click()

  await expect(wierszKonta('Messenger').locator('.w-gore')).toBeDisabled()
  await expect(wierszKonta('WhatsApp sluzbowy').locator('.w-dol')).toBeDisabled()
})

test('przesuniecie konta nie przerzuca operatora na pierwsza zakladke', async () => {
  // Operator pracuje na trzecim koncie; porzadkowanie listy nie moze go stamtad wyrzucic.
  await okno.locator('.kanal').nth(2).click()
  await expect(okno.locator('.kanal').nth(2)).toHaveAttribute('aria-selected', 'true')

  await okno.locator('#otworz-ustawienia').click()
  await wierszKonta('Messenger').locator('.w-dol').click()

  await expect(okno.locator('.kanal[aria-selected="true"] .kanal-nazwa')).toHaveText('WhatsApp sluzbowy')
})
