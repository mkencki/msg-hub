import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { clearStatusBar } from './helpers.js'

let dataDir
let electronApp
let page

test.beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'mhub-messages-'))
  electronApp = await electron.launch({ args: ['.', `--user-data-dir=${dataDir}`] })
  page = await electronApp.firstWindow()
  await page.waitForSelector('body[data-ready="1"]')
  await clearStatusBar(page)
})

test.afterEach(async () => {
  await electronApp.evaluate(({ clipboard }) => clipboard.clear()).catch(() => {})
  await electronApp.close().catch(() => {})
  const cleanup = rm(dataDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([cleanup, new Promise((done) => setTimeout(done, 3000))])
})

async function addAccount() {
  await page.locator('#add-account').click()
  await page.locator('#account-dialog input[name="name"]').fill('Test account')
  await page.locator('#save-account').click()
  await expect(page.locator('.channel')).toHaveCount(1)
}

// A silent failure is worse than a visible error: the panel disappears on every choice, so a
// failed insertion looks exactly like a successful one.
test('a macro clicked with no account says there is nowhere to insert', async () => {
  await page.evaluate(() => window.mHub.saveMacro({ name: 'Makro', text: 'content' }))

  await page.locator('#open-macros').click()
  await page.locator('#macro-list li').first().click()

  await expect(page.locator('#message')).toBeVisible()
  await expect(page.locator('#message')).toHaveText(/account/i)
})

test('a macro with neither content nor attachment reports that there is nothing to insert', async () => {
  await addAccount()
  await page.evaluate(() => window.mHub.saveMacro({ name: 'Makro puste', text: '' }))

  await page.locator('#open-macros').click()
  await page.locator('#macro-list li').first().click()

  await expect(page.locator('#message')).toBeVisible()
  await expect(page.locator('#message')).toHaveText(/neither content nor an attachment/i)
})

// The bar at the top lies OUTSIDE the dialog, and a modal freezes everything around it. An
// error raised by an open editor has to stay in the editor – otherwise the operator sees red
// text they can neither dismiss nor connect to the field it concerns.
test('a failed macro save stays in the editor and does not escape to the bar above the modal', async () => {
  await page.locator('#open-macros').click()
  await page.locator('#new-macro').click()
  await page.locator('#save-macro').click()

  await expect(page.locator('#macro-errors')).toHaveText(/name is required/)
  await expect(page.locator('#message')).toBeHidden()
})

test('a successful save clears the error shown on the previous attempt', async () => {
  await page.locator('#open-macros').click()
  await page.locator('#new-macro').click()
  await page.locator('#save-macro').click()
  await expect(page.locator('#macro-errors')).toHaveText(/name is required/)

  await page.locator('#editor-name').fill('Now with a name')
  await page.locator('#save-macro').click()
  await expect(page.locator('#editor-dialog')).toBeHidden()

  await page.locator('#open-macros').click()
  await page.locator('#new-macro').click()
  await expect(page.locator('#macro-errors')).toHaveText('')
})

test('a message in the bar can be dismissed with the button', async () => {
  await page.evaluate(() => window.mHub.saveMacro({ name: 'Makro', text: 'content' }))
  await page.locator('#open-macros').click()
  await page.locator('#macro-list li').first().click()
  await expect(page.locator('#message')).toBeVisible()

  await page.locator('#dismiss-message').click()

  await expect(page.locator('#message')).toBeHidden()
})

// The hidden attribute works through [hidden] { display: none } in the UA stylesheet. Any
// author display on the same element beats it and the bar stays visible despite hidden –
// a trap we have already fallen into once here.
test('a bar carrying the hidden attribute really is invisible', async () => {
  const wyliczony = await page.evaluate(
    () => getComputedStyle(document.getElementById('message')).display,
  )

  expect(wyliczony).toBe('none')
})
