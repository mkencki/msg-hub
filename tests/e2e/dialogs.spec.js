import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

let dataDir
let electronApp
let page

// An account's WebContentsView is a native view ABOVE the renderer. An open <dialog>
// lives in the renderer, so without hiding the views it is physically covered: the modal
// blocks clicks while the operator cannot see what is blocking them.
async function visibleViews() {
  return electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]
      .contentView.children.filter((w) => typeof w.getVisible === 'function' && w.getVisible())
      .length,
  )
}

test.beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'msghub-dialogs-'))
  electronApp = await electron.launch({ args: ['.', `--user-data-dir=${dataDir}`] })
  page = await electronApp.firstWindow()
  await page.waitForSelector('body[data-ready="1"]')

  await page.locator('#add-account').click()
  await page.locator('#account-dialog input[name="name"]').fill('Messenger')
  await page.locator('#account-dialog select[name="platform"]').selectOption('messenger')
  await page.locator('#save-account').click()
  await expect(page.locator('.channel')).toHaveCount(1)
})

test.afterEach(async () => {
  await electronApp.close()
  const cleanup = rm(dataDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([cleanup, new Promise((done) => setTimeout(done, 3000))])
})

test('the add-account dialog is visible even with an account loaded', async () => {
  await expect.poll(visibleViews).toBe(1)

  await page.locator('#add-account').click()
  await expect(page.locator('#account-dialog')).toBeVisible()
  await expect.poll(visibleViews).toBe(0)

  await page.locator('#account-dialog button[value="cancel"]').click()
  await expect(page.locator('#account-dialog')).toBeHidden()
  await expect.poll(visibleViews).toBe(1)
})

test('a second account can be added after the first', async () => {
  await page.locator('#add-account').click()
  await page.locator('#account-dialog input[name="name"]').fill('WhatsApp personal')
  await page.locator('#save-account').click()

  await expect(page.locator('.channel')).toHaveCount(2)
  await expect.poll(visibleViews).toBe(2)
})

test('the macro panel and the editor do not hide under the account view either', async () => {
  await page.keyboard.press('Control+Semicolon')
  await expect(page.locator('#macros-dialog')).toBeVisible()
  await expect.poll(visibleViews).toBe(0)

  await page.locator('#new-macro').click()
  await expect(page.locator('#editor-dialog')).toBeVisible()
  await expect.poll(visibleViews).toBe(0)

  await page.locator('#cancel-macro').click()
  await expect(page.locator('#editor-dialog')).toBeHidden()
  await expect.poll(visibleViews).toBe(1)
})

// The macro panel's Close button does not sit inside <form method="dialog">, so value="close"
// alone does not close it — without an explicit handler only ESC is left.
test('the Close button closes the macro panel and brings the account view back', async () => {
  await page.keyboard.press('Control+Semicolon')
  await expect(page.locator('#macros-dialog')).toBeVisible()
  await expect.poll(visibleViews).toBe(0)

  await page.locator('#close-macros').click()

  await expect(page.locator('#macros-dialog')).toBeHidden()
  await expect.poll(visibleViews).toBe(1)
})
