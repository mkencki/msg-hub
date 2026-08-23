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

test.beforeEach(async () => {
  katalogDanych = await mkdtemp(path.join(tmpdir(), 'msghub-usuwanie-'))
  aplikacja = await electron.launch({ args: ['.', `--user-data-dir=${katalogDanych}`] })
  okno = await aplikacja.firstWindow()
  await okno.waitForSelector('body[data-gotowy="1"]')

  await dodajKonto('WhatsApp prywatny', 'whatsapp')
  await dodajKonto('WhatsApp sluzbowy', 'whatsapp')
  await expect(okno.locator('.zakladka')).toHaveCount(2)
})

test.afterEach(async () => {
  await aplikacja.close()
  const sprzatanie = rm(katalogDanych, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([sprzatanie, new Promise((koniec) => setTimeout(koniec, 3000))])
})

test('usuniecie konta zabiera zakladke, wpis w pliku i widok', async () => {
  await okno.locator('.zakladka', { hasText: 'WhatsApp sluzbowy' }).locator('.usun-konto').click()
  await expect(okno.locator('#okno-usuwania')).toBeVisible()
  await expect(okno.locator('#okno-usuwania')).toContainText('WhatsApp sluzbowy')

  await okno.locator('#potwierdz-usuniecie').click()

  await expect(okno.locator('.zakladka')).toHaveCount(1)
  await expect(okno.locator('.zakladka')).toHaveText(/WhatsApp prywatny/)
  expect((await zapisaneKonta()).map((k) => k.nazwa)).toEqual(['WhatsApp prywatny'])

  await expect
    .poll(() =>
      aplikacja.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].contentView.children.length,
      ),
    )
    .toBe(1)
})

test('anulowanie nie usuwa niczego', async () => {
  await okno.locator('.zakladka', { hasText: 'WhatsApp sluzbowy' }).locator('.usun-konto').click()
  await okno.locator('#okno-usuwania button[value="anuluj"]').click()

  await expect(okno.locator('.zakladka')).toHaveCount(2)
  expect(await zapisaneKonta()).toHaveLength(2)
})

test('usuniecie konta czysci jego sesje, zeby nie zostalo zalogowanie', async () => {
  const idUsuwanego = (await zapisaneKonta())[1].id

  await aplikacja.evaluate(async ({ session }, id) => {
    await session
      .fromPartition(`persist:${id}`)
      .cookies.set({ url: 'https://przyklad.test', name: 'sesja', value: 'zalogowany' })
  }, idUsuwanego)

  await okno.locator('.zakladka', { hasText: 'WhatsApp sluzbowy' }).locator('.usun-konto').click()
  await okno.locator('#potwierdz-usuniecie').click()
  await expect(okno.locator('.zakladka')).toHaveCount(1)

  const ciasteczka = await aplikacja.evaluate(
    ({ session }, id) => session.fromPartition(`persist:${id}`).cookies.get({ name: 'sesja' }),
    idUsuwanego,
  )
  expect(ciasteczka).toEqual([])
})

test('usuniecie aktywnego konta przelacza na pozostale, nie zostawia pustki', async () => {
  await okno.locator('.zakladka', { hasText: 'WhatsApp prywatny' }).click()
  await okno.locator('.zakladka', { hasText: 'WhatsApp prywatny' }).locator('.usun-konto').click()
  await okno.locator('#potwierdz-usuniecie').click()

  await expect(okno.locator('.zakladka')).toHaveCount(1)
  await expect(okno.locator('.zakladka')).toHaveAttribute('aria-selected', 'true')
})
