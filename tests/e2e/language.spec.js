import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

let dataDir
let electronApp
let page

async function startApp() {
  electronApp = await electron.launch({ args: ['.', `--user-data-dir=${dataDir}`] })
  page = await electronApp.firstWindow()
  await page.waitForSelector('body[data-ready="1"]')
}

test.beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'msghub-language-'))
  await startApp()
})

test.afterEach(async () => {
  await electronApp.close().catch(() => {})
  const cleanup = rm(dataDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([cleanup, new Promise((done) => setTimeout(done, 3000))])
})

async function chooseLanguage(code) {
  await page.locator('#open-settings').click()
  await page.locator('#language-select').selectOption(code)
  await page.locator('#close-settings').click()
}

test('a fresh profile starts in English', async () => {
  await expect(page.locator('#add-account .action-label')).toHaveText('Add account')
  await expect(page.locator('.rail-title')).toHaveText('Channels')
  await expect(page.locator('#status-unread')).toHaveText('all read')
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('en')
})

test('each language signs itself with its own name, not a translation', async () => {
  await page.locator('#open-settings').click()
  await expect(page.locator('#language-select option')).toHaveText(['English', 'Polski'])
})

// Reloading the window would tear down the native account views along with their sign-ins,
// so a language change has to repaint the interface IN PLACE — content drawn from JS included.
test('choosing Polish repaints the content drawn from JS as well', async () => {
  await chooseLanguage('pl')

  await expect(page.locator('#add-account .action-label')).toHaveText('Dodaj konto')
  await expect(page.locator('.rail-title')).toHaveText('Kanały')
  // The status bar composes this string itself, so it would stay in English if the change
  // touched only the strings written into the HTML.
  await expect(page.locator('#status-unread')).toHaveText('wszystko przeczytane')
  await expect(page.locator('#status-name')).toHaveText('Brak kont')
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('pl')
})

test('the chosen language survives an application restart', async () => {
  await chooseLanguage('pl')
  await electronApp.close()

  await startApp()

  await expect(page.locator('.rail-title')).toHaveText('Kanały')
  expect(await page.evaluate(() => document.getElementById('language-select').value)).toBe('pl')
})

test('a damaged language value in the settings file does not sink the start', async () => {
  await page.evaluate(() => window.msgHub.setLanguage('klingon'))
  await electronApp.close()

  await startApp()

  // An unknown code falls back to the default instead of showing bare translation keys.
  await expect(page.locator('.rail-title')).toHaveText('Channels')
})
