import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

let katalogDanych
let aplikacja
let okno

test.beforeEach(async () => {
  katalogDanych = await mkdtemp(path.join(tmpdir(), 'msghub-konsola-'))
  aplikacja = await electron.launch({ args: ['.', `--user-data-dir=${katalogDanych}`] })
  okno = await aplikacja.firstWindow()
  await okno.waitForSelector('body[data-gotowy="1"]')
})

test.afterEach(async () => {
  await aplikacja.evaluate(({ clipboard }) => clipboard.clear()).catch(() => {})
  await aplikacja.close().catch(() => {})
  const sprzatanie = rm(katalogDanych, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([sprzatanie, new Promise((koniec) => setTimeout(koniec, 3000))])
})

async function dodajKonto(nazwa, platforma = 'whatsapp') {
  await okno.locator('#dodaj-konto').click()
  await okno.locator('#okno-konta input[name="nazwa"]').fill(nazwa)
  await okno.locator('#okno-konta select[name="platforma"]').selectOption(platforma)
  await okno.locator('#zapisz-konto').click()
  await expect(okno.locator('#okno-konta')).toBeHidden()
}

const kolorKanalu = () =>
  okno.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--kanal').trim())

const prostokatWidoku = () =>
  aplikacja.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    const widoczny = w.contentView.children.find((v) => v.getBounds().height > 0)
    return { widok: widoczny?.getBounds() ?? null, okno: w.getContentBounds() }
  })

// Widoki kont maja wlasny naglowek. Zakladki u gory staly naprzeciw niego,
// wiec tozsamosc konta konkurowala o miejsce z chrome cudzej strony.
test('widok konta zaczyna sie na prawo od szyny, nie pod paskiem u gory', async () => {
  await dodajKonto('WhatsApp testowy')

  const { widok, okno: ramka } = await prostokatWidoku()

  expect(widok).not.toBeNull()
  expect(widok.x).toBeGreaterThan(120)
  expect(widok.y).toBeLessThan(24)
  expect(widok.width).toBeLessThan(ramka.width - 120)
})

test('przelaczenie kanalu przemalowuje krawedz na antenie', async () => {
  await dodajKonto('Messenger firmowy', 'messenger')
  await dodajKonto('WhatsApp prywatny', 'whatsapp')

  await okno.locator('.kanal').first().click()
  const pierwszy = await kolorKanalu()

  await okno.locator('.kanal').nth(1).click()
  const drugi = await kolorKanalu()

  expect(pierwszy).toMatch(/^#?[0-9a-fA-F]{6}$|^rgb/)
  expect(drugi).not.toBe(pierwszy)
})

test('szyna pokazuje liczbe nowych wiadomosci przy koncie', async () => {
  await dodajKonto('WhatsApp testowy')
  const idKonta = await okno.evaluate(async () => (await window.mostHub.listaKont())[0].id)

  await aplikacja.evaluate(({ BrowserWindow }, id) => {
    BrowserWindow.getAllWindows()[0].webContents.send('licznik:zmiana', {
      suma: 4,
      wgKont: { [id]: 4 },
    })
  }, idKonta)

  // Polska odmiana liczebnika: 4 nowe, nie "4 nowych".
  await expect(okno.locator('.kanal .kanal-dane')).toHaveText('4 nowe')
})

test('szyna odmienia liczebnik zgodnie z polska gramatyka', async () => {
  await dodajKonto('WhatsApp testowy')
  const idKonta = await okno.evaluate(async () => (await window.mostHub.listaKont())[0].id)

  const pokaz = (ile) =>
    aplikacja.evaluate(({ BrowserWindow }, dane) => {
      BrowserWindow.getAllWindows()[0].webContents.send('licznik:zmiana', {
        suma: dane.ile,
        wgKont: { [dane.id]: dane.ile },
      })
    }, { id: idKonta, ile })

  await pokaz(1)
  await expect(okno.locator('.kanal .kanal-dane')).toHaveText('1 nowa')
  await pokaz(12)
  await expect(okno.locator('.kanal .kanal-dane')).toHaveText('12 nowych')
  await pokaz(0)
  await expect(okno.locator('.kanal .kanal-dane')).toHaveText('brak nowych')
})

test('strzalki i Enter wstawiaja zaznaczone makro bez siegania po mysz', async () => {
  await dodajKonto('WhatsApp testowy')
  await okno.evaluate(() => window.mostHub.zapiszMakro({ nazwa: 'Alfa', tekst: 'tresc alfa' }))
  await okno.evaluate(() => window.mostHub.zapiszMakro({ nazwa: 'Beta', tekst: 'tresc beta' }))
  await aplikacja.evaluate(({ clipboard }) => clipboard.writeText('stan-sprzed'))

  await okno.keyboard.press('Control+Semicolon')
  await expect(okno.locator('#okno-makr')).toBeVisible()
  await okno.keyboard.press('ArrowDown')
  await okno.keyboard.press('Enter')

  await expect(okno.locator('#okno-makr')).toBeHidden()
  expect(await aplikacja.evaluate(({ clipboard }) => clipboard.readText())).toBe('tresc beta')
})

// Panel zamyka sie przy kazdym wyborze. Bez meldunku operator nie wie,
// czy tresc poszla i do ktorego konta — a to jedyne ryzyko tego produktu.
test('po wstawieniu listwa melduje konto i oddaje Enter operatorowi', async () => {
  await dodajKonto('WhatsApp sluzbowy')
  await okno.evaluate(() => window.mostHub.zapiszMakro({ nazwa: 'Alfa', tekst: 'tresc alfa' }))

  await okno.keyboard.press('Control+Semicolon')
  await okno.locator('#lista-makr li').first().click()

  await expect(okno.locator('#komunikat')).toBeVisible()
  await expect(okno.locator('#komunikat')).toContainText('WhatsApp sluzbowy')
  await expect(okno.locator('#komunikat')).toContainText(/Enter/)
})

test('meldunek o wstawieniu nie jest bledem i ma inny ton', async () => {
  await dodajKonto('WhatsApp testowy')
  await okno.evaluate(() => window.mostHub.zapiszMakro({ nazwa: 'Alfa', tekst: 'tresc alfa' }))

  await okno.keyboard.press('Control+Semicolon')
  await okno.locator('#lista-makr li').first().click()
  await expect(okno.locator('#komunikat')).toBeVisible()

  expect(await okno.locator('#komunikat').getAttribute('data-ton')).toBe('info')
})

test('niepowodzenie wstawienia zapala ton bledu', async () => {
  await okno.evaluate(() => window.mostHub.zapiszMakro({ nazwa: 'Alfa', tekst: 'tresc alfa' }))

  await okno.locator('#otworz-makra').click()
  await okno.locator('#lista-makr li').first().click()

  await expect(okno.locator('#komunikat')).toBeVisible()
  expect(await okno.locator('#komunikat').getAttribute('data-ton')).toBe('blad')
})
