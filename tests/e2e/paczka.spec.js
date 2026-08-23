import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const EXE = path.resolve('dist/win-unpacked/msg-hub.exe')

// Paczka powstaje dopiero po `npm run dist` — bez niej test nie ma czego sprawdzac.
let zbudowana = true
try {
  await access(EXE)
} catch {
  zbudowana = false
}

test.skip(!zbudowana, 'brak dist/win-unpacked — uruchom najpierw npm run dist')

test('spakowana aplikacja wstaje z dzialajacym rendererem i mostem IPC', async () => {
  const katalogDanych = await mkdtemp(path.join(tmpdir(), 'msghub-paczka-'))
  const aplikacja = await electron.launch({
    executablePath: EXE,
    args: [`--user-data-dir=${katalogDanych}`],
  })
  const okno = await aplikacja.firstWindow()
  await okno.waitForSelector('body[data-gotowy="1"]')

  // To sa dokladnie te miejsca, w ktorych paczka potrafi rozjechac sie ze zrodlami:
  // asar, ESM w procesie glownym i preload w CommonJS.
  expect(await okno.title()).toBe('msg-hub')
  await expect(okno.locator('#dodaj-konto')).toBeVisible()
  expect(await okno.evaluate(() => window.mostHub.listaKont())).toEqual([])

  await okno.keyboard.press('Control+Semicolon')
  await expect(okno.locator('#okno-makr')).toBeVisible()

  await aplikacja.close()
  const sprzatanie = rm(katalogDanych, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([sprzatanie, new Promise((koniec) => setTimeout(koniec, 3000))])
})
