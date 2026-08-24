import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

let katalogDanych
let aplikacja
let okno

// WebContentsView konta jest natywnym widokiem NAD rendererem. Otwarty <dialog>
// zyje w rendererze, wiec bez schowania widokow jest fizycznie zasloniety:
// modal blokuje klikniecia, a operator nie widzi, co go blokuje.
async function widoczneWidoki() {
  return aplikacja.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]
      .contentView.children.filter((w) => typeof w.getVisible === 'function' && w.getVisible())
      .length,
  )
}

test.beforeEach(async () => {
  katalogDanych = await mkdtemp(path.join(tmpdir(), 'msghub-dialogi-'))
  aplikacja = await electron.launch({ args: ['.', `--user-data-dir=${katalogDanych}`] })
  okno = await aplikacja.firstWindow()
  await okno.waitForSelector('body[data-gotowy="1"]')

  await okno.locator('#dodaj-konto').click()
  await okno.locator('#okno-konta input[name="nazwa"]').fill('Messenger')
  await okno.locator('#okno-konta select[name="platforma"]').selectOption('messenger')
  await okno.locator('#zapisz-konto').click()
  await expect(okno.locator('.kanal')).toHaveCount(1)
})

test.afterEach(async () => {
  await aplikacja.close()
  const sprzatanie = rm(katalogDanych, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([sprzatanie, new Promise((koniec) => setTimeout(koniec, 3000))])
})

test('okno dodawania konta jest widoczne mimo zaladowanego konta', async () => {
  await expect.poll(widoczneWidoki).toBe(1)

  await okno.locator('#dodaj-konto').click()
  await expect(okno.locator('#okno-konta')).toBeVisible()
  await expect.poll(widoczneWidoki).toBe(0)

  await okno.locator('#okno-konta button[value="anuluj"]').click()
  await expect(okno.locator('#okno-konta')).toBeHidden()
  await expect.poll(widoczneWidoki).toBe(1)
})

test('drugie konto da sie dodac po pierwszym', async () => {
  await okno.locator('#dodaj-konto').click()
  await okno.locator('#okno-konta input[name="nazwa"]').fill('WhatsApp prywatny')
  await okno.locator('#zapisz-konto').click()

  await expect(okno.locator('.kanal')).toHaveCount(2)
  await expect.poll(widoczneWidoki).toBe(2)
})

test('panel makr i edytor tez nie chowaja sie pod widokiem konta', async () => {
  await okno.keyboard.press('Control+Semicolon')
  await expect(okno.locator('#okno-makr')).toBeVisible()
  await expect.poll(widoczneWidoki).toBe(0)

  await okno.locator('#nowe-makro').click()
  await expect(okno.locator('#okno-edytora')).toBeVisible()
  await expect.poll(widoczneWidoki).toBe(0)

  await okno.locator('#anuluj-makro').click()
  await expect(okno.locator('#okno-edytora')).toBeHidden()
  await expect.poll(widoczneWidoki).toBe(1)
})

// Przycisk "Zamknij" panelu makr nie siedzi w <form method="dialog">, wiec samo
// value="zamknij" go nie zamyka — bez jawnej obslugi zostaje wylacznie ESC.
test('przycisk Zamknij zamyka panel makr i przywraca widok konta', async () => {
  await okno.keyboard.press('Control+Semicolon')
  await expect(okno.locator('#okno-makr')).toBeVisible()
  await expect.poll(widoczneWidoki).toBe(0)

  await okno.locator('#zamknij-makra').click()

  await expect(okno.locator('#okno-makr')).toBeHidden()
  await expect.poll(widoczneWidoki).toBe(1)
})
