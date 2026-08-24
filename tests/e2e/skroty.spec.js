import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

let katalogDanych
let aplikacja
let okno

test.beforeEach(async () => {
  katalogDanych = await mkdtemp(path.join(tmpdir(), 'msghub-skroty-e2e-'))
  aplikacja = await electron.launch({ args: ['.', `--user-data-dir=${katalogDanych}`] })
  okno = await aplikacja.firstWindow()
  await okno.waitForSelector('body[data-gotowy="1"]')
})

test.afterEach(async () => {
  await aplikacja.close()
  const sprzatanie = rm(katalogDanych, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([sprzatanie, new Promise((koniec) => setTimeout(koniec, 3000))])
})

// Widok konta to natywna warstwa NAD rendererem — gdy trzyma fokus, klawiatura
// nie dociera do okna glownego. Bez routingu z widoku skrot jest martwy przez
// wiekszosc czasu pracy, bo fokus siedzi w rozmowie.
async function fokusNaWidokKonta() {
  await okno.locator('#dodaj-konto').click()
  await okno.locator('#okno-konta input[name="nazwa"]').fill('WhatsApp testowy')
  await okno.locator('#zapisz-konto').click()
  await expect(okno.locator('.kanal')).toHaveCount(1)

  await aplikacja.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].contentView.children[0].webContents.focus()
  })
}

async function wcisnijWWidoku(klawisz) {
  await aplikacja.evaluate(({ BrowserWindow }, kod) => {
    const widok = BrowserWindow.getAllWindows()[0].contentView.children[0]
    widok.webContents.sendInputEvent({ type: 'keyDown', keyCode: kod, modifiers: ['control'] })
    widok.webContents.sendInputEvent({ type: 'keyUp', keyCode: kod, modifiers: ['control'] })
  }, klawisz)
}

test('Ctrl+; otwiera panel makr, gdy fokus trzyma widok konta', async () => {
  await fokusNaWidokKonta()
  await wcisnijWWidoku(';')

  await expect(okno.locator('#okno-makr')).toBeVisible()
})

test('panel makr otwarty z widoku konta przyjmuje pisanie w wyszukiwarce', async () => {
  await okno.evaluate(() => window.mostHub.zapiszMakro({ nazwa: 'Passango', tekst: 'instalacja' }))
  await okno.evaluate(() => window.mostHub.zapiszMakro({ nazwa: 'Strefa Klienta', tekst: 'logowanie' }))
  await fokusNaWidokKonta()
  await wcisnijWWidoku(';')
  await expect(okno.locator('#okno-makr')).toBeVisible()

  // Fokus musi wrocic do okna glownego, inaczej operator otwiera panel i nie moze w nim pisac.
  await okno.keyboard.type('strefa')

  await expect(okno.locator('#szukaj-makro')).toHaveValue('strefa')
  await expect(okno.locator('#lista-makr li')).toHaveCount(1)
})
