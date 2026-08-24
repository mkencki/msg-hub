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

async function wypelnijFormularzKonta(nazwa, platforma) {
  await okno.locator('#okno-konta input[name="nazwa"]').fill(nazwa)
  await okno.locator('#okno-konta select[name="platforma"]').selectOption(platforma)
  await okno.locator('#zapisz-konto').click()
  await expect(okno.locator('#okno-konta')).toBeHidden()
}

test.beforeEach(async () => {
  katalogDanych = await mkdtemp(path.join(tmpdir(), 'msghub-ustawienia-'))
  aplikacja = await electron.launch({ args: ['.', `--user-data-dir=${katalogDanych}`] })
  okno = await aplikacja.firstWindow()
  await okno.waitForSelector('body[data-gotowy="1"]')

  await okno.locator('#dodaj-konto').click()
  await wypelnijFormularzKonta('WhatsApp prywatny', 'whatsapp')
  await okno.locator('#dodaj-konto').click()
  await wypelnijFormularzKonta('WhatsApp sluzbowy', 'whatsapp')
  await expect(okno.locator('.kanal')).toHaveCount(2)
})

test.afterEach(async () => {
  await aplikacja.close().catch(() => {})
  const sprzatanie = rm(katalogDanych, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([sprzatanie, new Promise((koniec) => setTimeout(koniec, 3000))])
})

test('zakladka nie ma juz krzyzyka — usuniecie nie moze byc jednym przypadkowym klikiem', async () => {
  await expect(okno.locator('.kanal .usun-konto')).toHaveCount(0)
})

test('ustawienia pokazuja wszystkie konta z platforma', async () => {
  await okno.locator('#otworz-ustawienia').click()

  await expect(okno.locator('#okno-ustawien')).toBeVisible()
  await expect(okno.locator('#lista-kont li')).toHaveCount(2)
  await expect(okno.locator('#lista-kont li').first()).toContainText('WhatsApp prywatny')
  await expect(okno.locator('#lista-kont li').first()).toContainText('whatsapp')
})

test('usuniecie konta z ustawien zabiera wpis, zakladke i sesje', async () => {
  const idUsuwanego = (await zapisaneKonta())[1].id
  await aplikacja.evaluate(async ({ session }, id) => {
    await session
      .fromPartition(`persist:${id}`)
      .cookies.set({ url: 'https://przyklad.test', name: 'sesja', value: 'zalogowany' })
  }, idUsuwanego)

  await okno.locator('#otworz-ustawienia').click()
  await okno.locator('#lista-kont li', { hasText: 'WhatsApp sluzbowy' }).locator('.usun-konto').click()

  await expect(okno.locator('#okno-usuwania')).toBeVisible()
  await expect(okno.locator('#okno-usuwania')).toContainText('WhatsApp sluzbowy')
  await okno.locator('#potwierdz-usuniecie').click()

  // Po usunieciu operator zostaje w ustawieniach z odswiezona lista.
  await expect(okno.locator('#okno-ustawien')).toBeVisible()
  await expect(okno.locator('#lista-kont li')).toHaveCount(1)

  expect((await zapisaneKonta()).map((k) => k.nazwa)).toEqual(['WhatsApp prywatny'])
  await okno.locator('#zamknij-ustawienia').click()
  await expect(okno.locator('.kanal')).toHaveCount(1)

  const ciasteczka = await aplikacja.evaluate(
    ({ session }, id) => session.fromPartition(`persist:${id}`).cookies.get({ name: 'sesja' }),
    idUsuwanego,
  )
  expect(ciasteczka).toEqual([])
})

test('anulowanie usuniecia nie rusza niczego', async () => {
  await okno.locator('#otworz-ustawienia').click()
  await okno.locator('#lista-kont li', { hasText: 'WhatsApp sluzbowy' }).locator('.usun-konto').click()
  await okno.locator('#okno-usuwania button[value="anuluj"]').click()

  await expect(okno.locator('#lista-kont li')).toHaveCount(2)
  expect(await zapisaneKonta()).toHaveLength(2)
})

test('konto da sie dodac zarowno z ustawien, jak i przyciskiem + w pasku', async () => {
  await okno.locator('#otworz-ustawienia').click()
  await okno.locator('#dodaj-konto-ustawienia').click()
  await expect(okno.locator('#okno-konta')).toBeVisible()
  await wypelnijFormularzKonta('Messenger', 'messenger')
  await expect(okno.locator('.kanal')).toHaveCount(3)

  await okno.locator('#dodaj-konto').click()
  await wypelnijFormularzKonta('Messenger firmowy', 'messenger')
  await expect(okno.locator('.kanal')).toHaveCount(4)
})

test('usuniecie ostatniego konta zostawia pusty pasek bez bledu', async () => {
  await okno.locator('#otworz-ustawienia').click()
  for (const nazwa of ['WhatsApp sluzbowy', 'WhatsApp prywatny']) {
    await okno.locator('#lista-kont li', { hasText: nazwa }).locator('.usun-konto').click()
    await okno.locator('#potwierdz-usuniecie').click()
  }

  await expect(okno.locator('#lista-kont .puste')).toBeVisible()
  await okno.locator('#zamknij-ustawienia').click()
  await expect(okno.locator('.kanal')).toHaveCount(0)
  await expect(okno.locator('#komunikat')).toBeHidden()
})

test('usuniecie konta i zamkniecie aplikacji nie rzuca wyjatku w procesie glownym', async () => {
  // Regresja z 2026-08-24: widok konta emitowal page-title-updated w trakcie
  // niszczenia, a odswiezBadge siegalo po zamkniete okno. Electron pokazywal
  // modalne "Object has been destroyed", ktore blokowalo zamkniecie procesu.
  const wyjscieBledow = []
  aplikacja.process().stderr.on('data', (kawalek) => wyjscieBledow.push(String(kawalek)))

  await okno.locator('#otworz-ustawienia').click()
  await okno.locator('#lista-kont li', { hasText: 'WhatsApp sluzbowy' }).locator('.usun-konto').click()
  await okno.locator('#potwierdz-usuniecie').click()
  await expect(okno.locator('#lista-kont li')).toHaveCount(1)
  await okno.locator('#zamknij-ustawienia').click()

  await aplikacja.close()

  expect(wyjscieBledow.join('')).not.toMatch(/Object has been destroyed|Uncaught Exception/)
})
