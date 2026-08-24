import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

let dataDir
let electronApp
let page

test.beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'msghub-skroty-e2e-'))
  electronApp = await electron.launch({ args: ['.', `--user-data-dir=${dataDir}`] })
  page = await electronApp.firstWindow()
  await page.waitForSelector('body[data-ready="1"]')
})

test.afterEach(async () => {
  await electronApp.close()
  const cleanup = rm(dataDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([cleanup, new Promise((done) => setTimeout(done, 3000))])
})

// An account view is a native layer ABOVE the renderer — while it holds focus the
// keyboard never reaches the main window. Without routing the key out of the view the
// shortcut is dead for most of the working time, because focus sits in the conversation.
async function fokusNaWidokKonta() {
  await page.locator('#add-account').click()
  await page.locator('#account-dialog input[name="name"]').fill('WhatsApp testowy')
  await page.locator('#save-account').click()
  await expect(page.locator('.channel')).toHaveCount(1)

  // A channel in the rail does not yet mean a native view: the main process creates one in
  // response to the switch, so children[0] is briefly undefined.
  await expect
    .poll(() =>
      electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.length),
    )
    .toBeGreaterThan(0)

  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].contentView.children[0].webContents.focus()
  })
}

async function wcisnijWWidoku(klawisz) {
  await electronApp.evaluate(({ BrowserWindow }, code) => {
    const widok = BrowserWindow.getAllWindows()[0].contentView.children[0]
    widok.webContents.sendInputEvent({ type: 'keyDown', keyCode: code, modifiers: ['control'] })
    widok.webContents.sendInputEvent({ type: 'keyUp', keyCode: code, modifiers: ['control'] })
  }, klawisz)
}

test('Ctrl+; opens the macro panel while an account view holds focus', async () => {
  await fokusNaWidokKonta()
  await wcisnijWWidoku(';')

  await expect(page.locator('#macros-dialog')).toBeVisible()
})

test('a macro panel opened from an account view accepts typing in the search box', async () => {
  await page.evaluate(() => window.msgHub.saveMacro({ name: 'Passango', text: 'instalacja' }))
  await page.evaluate(() => window.msgHub.saveMacro({ name: 'Strefa Klienta', text: 'logowanie' }))
  await fokusNaWidokKonta()
  await wcisnijWWidoku(';')
  await expect(page.locator('#macros-dialog')).toBeVisible()

  // Focus has to return to the main window, or the operator opens the panel and cannot type.
  await page.keyboard.type('strefa')

  await expect(page.locator('#macro-search')).toHaveValue('strefa')
  await expect(page.locator('#macro-list li')).toHaveCount(1)
})
