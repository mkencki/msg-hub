import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm, access } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
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

// Smart App Control blokuje uruchomienie wlasnego, niepodpisanego pliku .exe.
// To ograniczenie SRODOWISKA, nie usterka paczki — test mowi to wprost,
// zamiast czerwienic sie bez wyjasnienia albo udawac sukces.
function smartAppControlWlaczony() {
  // path.win32.join laczy backslashem — literal w zrodle bywa zjadany przy edycji.
  const klucz = path.win32.join('HKLM', 'SYSTEM', 'CurrentControlSet', 'Control', 'CI', 'Policy')
  try {
    const wynik = execFileSync('C:/Windows/System32/reg.exe', ['query', klucz, '/v', 'VerifiedAndReputablePolicyState'], {
      encoding: 'utf8',
    })
    return /0x1\s*$/m.test(wynik)
  } catch {
    return false
  }
}

test('spakowana aplikacja wstaje z dzialajacym rendererem i mostem IPC', async () => {
  // Warunek pominiecia musi byc W SRODKU testu — test.skip(warunek, opis) na poziomie
  // pliku Playwright czyta jako deklaracje pominietego testu, nie jako warunek.
  test.skip(!zbudowana, 'brak dist/win-unpacked — uruchom najpierw npm run dist')
  test.skip(
    smartAppControlWlaczony(),
    'Smart App Control blokuje niepodpisane pliki .exe — paczki nie da sie tu uruchomic. ' +
      'Aplikacje uruchamiaj przez npm start albo skrot do node_modules/electron/dist/electron.exe.',
  )

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
  await okno.locator('#okno-makr button[value="zamknij"]').click()

  // Regresja z 2026-08-24: przy zaladowanym koncie okna dialogowe chowaly sie
  // pod natywnym widokiem konta. Sprawdzamy to na PACZCE, bo zrodla moga byc
  // juz naprawione, a wdrozona paczka wciaz stara.
  await okno.locator('#dodaj-konto').click()
  await okno.locator('#okno-konta input[name="nazwa"]').fill('Messenger')
  await okno.locator('#okno-konta select[name="platforma"]').selectOption('messenger')
  await okno.locator('#zapisz-konto').click()
  await expect(okno.locator('.zakladka')).toHaveCount(1)

  await okno.locator('#dodaj-konto').click()
  await expect(okno.locator('#okno-konta')).toBeVisible()
  await expect
    .poll(() =>
      aplikacja.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].contentView.children.filter((w) => w.getVisible()).length,
      ),
    )
    .toBe(0)

  await aplikacja.close()
  const sprzatanie = rm(katalogDanych, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([sprzatanie, new Promise((koniec) => setTimeout(koniec, 3000))])
})
