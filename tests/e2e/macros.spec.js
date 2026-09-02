import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

let dataDir
let electronApp
let page

test.beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'mhub-macros-e2e-'))
  electronApp = await electron.launch({ args: ['.', `--user-data-dir=${dataDir}`] })
  page = await electronApp.firstWindow()
  await page.waitForSelector('body[data-ready="1"]')
})

test.afterEach(async () => {
  await electronApp.close()
  const cleanup = rm(dataDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([cleanup, new Promise((done) => setTimeout(done, 3000))])
})

test('Ctrl+; opens the macro panel, which starts out empty', async () => {
  await page.keyboard.press('Control+Semicolon')

  await expect(page.locator('#macros-dialog')).toBeVisible()
  await expect(page.locator('#macro-list .empty')).toHaveText(/No macros/)
})

test('a saved macro appears on the list and can be found by its content', async () => {
  await page.evaluate(() =>
    window.mHub.saveMacro({
      name: 'Client Zone manual',
      text: '*How to add a driver:*\n- Sign in\n- Open Drivers',
    }),
  )
  await page.evaluate(() =>
    window.mHub.saveMacro({ name: 'Passango', text: 'device installation' }),
  )

  await page.keyboard.press('Control+Semicolon')
  await expect(page.locator('#macro-list li')).toHaveCount(2)

  // Search has to reach the content, not just the name – the phrase appears only in the content.
  await page.locator('#macro-search').fill('driver')
  await expect(page.locator('#macro-list li')).toHaveCount(1)
  await expect(page.locator('#macro-list li')).toHaveText(/Client Zone/)
})

test('choosing a macro puts the text on the clipboard and sends no message', async () => {
  // The account is created through the same form the operator uses.
  await page.locator('#add-account').click()
  await page.locator('#account-dialog input[name="name"]').fill('WhatsApp test')
  await page.locator('#save-account').click()
  await expect(page.locator('.channel')).toHaveCount(1)

  const content = '*How to add a driver:*\n- Sign in'
  await page.evaluate(
    (text) => window.mHub.saveMacro({ name: 'Client Zone', text }),
    content,
  )

  await electronApp.evaluate(({ clipboard }) => clipboard.writeText('whatever was on the clipboard before'))

  await page.keyboard.press('Control+Semicolon')
  await page.locator('#macro-list li').first().click()

  // The panel disappears BEFORE the insertion finishes – insertMacro() closes the dialog
  // and only then waits for the main process. Its disappearance therefore cannot measure
  // the end of the operation; the signal is the status-bar report, which lands once the
  // IPC call resolves.
  await expect(page.locator('#message')).toBeVisible()

  const onClipboard = await electronApp.evaluate(({ clipboard }) => clipboard.readText())
  expect(onClipboard).toBe(content)

  // Rule 7.1 (no sending path) is guarded by the unit tests in tests/insertion.test.js
  // and tests/boundaries.test.js.
})

test('the editor formats text, shows a preview and saves the macro', async () => {
  await page.keyboard.press('Control+Semicolon')
  await page.locator('#new-macro').click()
  await expect(page.locator('#editor-dialog')).toBeVisible()

  await page.locator('#editor-name').fill('Client Zone manual')
  await page.locator('#editor-text').fill('How to add a driver:\nSign in')

  // The formatting bar acts on the line the caret sits in.
  await page.locator('#editor-text').click()
  await page.keyboard.press('Control+Home')
  await page.locator('#format-bar button[data-prefix="- "]').click()

  await expect(page.locator('#editor-text')).toHaveValue('- How to add a driver:\nSign in')

  // The preview has to show a list bullet, not a raw dash.
  await expect(page.locator('#editor-preview li')).toHaveText('How to add a driver:')

  await page.locator('#save-macro').click()
  await expect(page.locator('#editor-dialog')).toBeHidden()

  await page.keyboard.press('Control+Semicolon')
  await expect(page.locator('#macro-list li')).toHaveText(/Client Zone manual/)
})

test('the preview does not execute HTML pasted into the macro content', async () => {
  await page.keyboard.press('Control+Semicolon')
  await page.locator('#new-macro').click()
  await page.locator('#editor-text').fill('<img src=x onerror="window.broken=1">')

  await expect(page.locator('#editor-preview img')).toHaveCount(0)
  expect(await page.evaluate(() => window.broken)).toBeUndefined()
})

test('a macro without a name is refused, with a message', async () => {
  await page.keyboard.press('Control+Semicolon')
  await page.locator('#new-macro').click()
  await page.locator('#editor-text').fill('content without a name')
  await page.locator('#save-macro').click()

  // The error stays in the editor – the bar above lies outside the modal and would be
  // impossible to click.
  await expect(page.locator('#macro-errors')).toHaveText(/name is required/)
})
