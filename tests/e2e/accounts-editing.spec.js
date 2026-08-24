import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

let dataDir
let electronApp
let page

async function savedAccounts() {
  const content = await readFile(path.join(dataDir, 'accounts.json'), 'utf8')
  return JSON.parse(content).accounts
}

async function addAccount(name, platform) {
  await page.locator('#add-account').click()
  await page.locator('#account-dialog input[name="name"]').fill(name)
  await page.locator('#account-dialog select[name="platform"]').selectOption(platform)
  await page.locator('#save-account').click()
  await expect(page.locator('#account-dialog')).toBeHidden()
}

function wierszKonta(name) {
  return page.locator('#account-list li', { hasText: name })
}

test.beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'msghub-accounts-edycja-'))
  electronApp = await electron.launch({ args: ['.', `--user-data-dir=${dataDir}`] })
  page = await electronApp.firstWindow()
  await page.waitForSelector('body[data-ready="1"]')

  await addAccount('Messenger', 'messenger')
  await addAccount('WhatsApp prywatny', 'whatsapp')
  await addAccount('WhatsApp sluzbowy', 'whatsapp')
  await expect(page.locator('.channel')).toHaveCount(3)
})

test.afterEach(async () => {
  await electronApp.close().catch(() => {})
  const cleanup = rm(dataDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([cleanup, new Promise((done) => setTimeout(done, 3000))])
})

test('Edit opens the form filled with the account data', async () => {
  await page.locator('#open-settings').click()
  await wierszKonta('WhatsApp prywatny').locator('.edit-account').click()

  await expect(page.locator('#account-dialog')).toBeVisible()
  await expect(page.locator('#account-dialog input[name="name"]')).toHaveValue('WhatsApp prywatny')
})

test('a rename fixes the channel and does not create a second account', async () => {
  await page.locator('#open-settings').click()
  await wierszKonta('WhatsApp prywatny').locator('.edit-account').click()
  await page.locator('#account-dialog input[name="name"]').fill('WhatsApp dom')
  await page.locator('#save-account').click()

  await expect(page.locator('.channel')).toHaveCount(3)
  await expect(page.locator('.channel').nth(1).locator('.channel-name')).toHaveText('WhatsApp dom')
})

test('a rename does not touch the account id, so the sign-in stays', async () => {
  const przed = (await savedAccounts())[1].id

  await page.locator('#open-settings').click()
  await wierszKonta('WhatsApp prywatny').locator('.edit-account').click()
  await page.locator('#account-dialog input[name="name"]').fill('WhatsApp dom')
  await page.locator('#save-account').click()
  await expect(page.locator('.channel').nth(1).locator('.channel-name')).toHaveText('WhatsApp dom')

  const po = await savedAccounts()
  expect(po[1].id).toBe(przed)
  expect(po[1].name).toBe('WhatsApp dom')
})

test('editing cannot swap the platform, because that means a different session and a different address', async () => {
  await page.locator('#open-settings').click()
  await wierszKonta('WhatsApp prywatny').locator('.edit-account').click()

  await expect(page.locator('#account-dialog select[name="platform"]')).toBeDisabled()
})

test('an empty name is refused when editing, with a message', async () => {
  await page.locator('#open-settings').click()
  await wierszKonta('WhatsApp prywatny').locator('.edit-account').click()
  await page.locator('#account-dialog input[name="name"]').fill('   ')
  await page.locator('#save-account').click()

  await expect(page.locator('#account-errors')).toHaveText(/name is required/)
  expect((await savedAccounts())[1].name).toBe('WhatsApp prywatny')
})

test('the up button changes the channel order and saves it', async () => {
  await page.locator('#open-settings').click()
  await wierszKonta('WhatsApp sluzbowy').locator('.move-up').click()

  await expect(page.locator('.channel').nth(1).locator('.channel-name')).toHaveText('WhatsApp sluzbowy')
  expect((await savedAccounts()).map((k) => k.name)).toEqual([
    'Messenger',
    'WhatsApp sluzbowy',
    'WhatsApp prywatny',
  ])
})

test('the down button changes the channel order', async () => {
  await page.locator('#open-settings').click()
  await wierszKonta('Messenger').locator('.move-down').click()

  await expect(page.locator('.channel').first().locator('.channel-name')).toHaveText('WhatsApp prywatny')
  expect((await savedAccounts()).map((k) => k.name)).toEqual([
    'WhatsApp prywatny',
    'Messenger',
    'WhatsApp sluzbowy',
  ])
})

test('the ends of the list have their move buttons disabled', async () => {
  await page.locator('#open-settings').click()

  await expect(wierszKonta('Messenger').locator('.move-up')).toBeDisabled()
  await expect(wierszKonta('WhatsApp sluzbowy').locator('.move-down')).toBeDisabled()
})

test('moving an account does not throw the operator back to the first channel', async () => {
  // The operator is working in the third account; tidying the list must not evict them.
  await page.locator('.channel').nth(2).click()
  await expect(page.locator('.channel').nth(2)).toHaveAttribute('aria-selected', 'true')

  await page.locator('#open-settings').click()
  await wierszKonta('Messenger').locator('.move-down').click()

  await expect(page.locator('.channel[aria-selected="true"] .channel-name')).toHaveText('WhatsApp sluzbowy')
})
