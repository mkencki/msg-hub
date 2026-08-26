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

function accountRow(name) {
  return page.locator('#account-list li', { hasText: name })
}

test.beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'mhub-accounts-editing-'))
  electronApp = await electron.launch({ args: ['.', `--user-data-dir=${dataDir}`] })
  page = await electronApp.firstWindow()
  await page.waitForSelector('body[data-ready="1"]')

  await addAccount('Messenger', 'messenger')
  await addAccount('WhatsApp personal', 'whatsapp')
  await addAccount('WhatsApp work', 'whatsapp')
  await expect(page.locator('.channel')).toHaveCount(3)
})

test.afterEach(async () => {
  await electronApp.close().catch(() => {})
  const cleanup = rm(dataDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([cleanup, new Promise((done) => setTimeout(done, 3000))])
})

test('Edit opens the form filled with the account data', async () => {
  await page.locator('#open-settings').click()
  await accountRow('WhatsApp personal').locator('.edit-account').click()

  await expect(page.locator('#account-dialog')).toBeVisible()
  await expect(page.locator('#account-dialog input[name="name"]')).toHaveValue('WhatsApp personal')
})

test('a rename fixes the channel and does not create a second account', async () => {
  await page.locator('#open-settings').click()
  await accountRow('WhatsApp personal').locator('.edit-account').click()
  await page.locator('#account-dialog input[name="name"]').fill('WhatsApp home')
  await page.locator('#save-account').click()

  await expect(page.locator('.channel')).toHaveCount(3)
  await expect(page.locator('.channel').nth(1).locator('.channel-name')).toHaveText('WhatsApp home')
})

test('a rename does not touch the account id, so the sign-in stays', async () => {
  const idBefore = (await savedAccounts())[1].id

  await page.locator('#open-settings').click()
  await accountRow('WhatsApp personal').locator('.edit-account').click()
  await page.locator('#account-dialog input[name="name"]').fill('WhatsApp home')
  await page.locator('#save-account').click()
  await expect(page.locator('.channel').nth(1).locator('.channel-name')).toHaveText('WhatsApp home')

  const after = await savedAccounts()
  expect(after[1].id).toBe(idBefore)
  expect(after[1].name).toBe('WhatsApp home')
})

test('editing cannot swap the platform, because that means a different session and a different address', async () => {
  await page.locator('#open-settings').click()
  await accountRow('WhatsApp personal').locator('.edit-account').click()

  await expect(page.locator('#account-dialog select[name="platform"]')).toBeDisabled()
})

test('an empty name is refused when editing, with a message', async () => {
  await page.locator('#open-settings').click()
  await accountRow('WhatsApp personal').locator('.edit-account').click()
  await page.locator('#account-dialog input[name="name"]').fill('   ')
  await page.locator('#save-account').click()

  await expect(page.locator('#account-errors')).toHaveText(/name is required/)
  expect((await savedAccounts())[1].name).toBe('WhatsApp personal')
})

test('the up button changes the channel order and saves it', async () => {
  await page.locator('#open-settings').click()
  await accountRow('WhatsApp work').locator('.move-up').click()

  await expect(page.locator('.channel').nth(1).locator('.channel-name')).toHaveText('WhatsApp work')
  expect((await savedAccounts()).map((a) => a.name)).toEqual([
    'Messenger',
    'WhatsApp work',
    'WhatsApp personal',
  ])
})

test('the down button changes the channel order', async () => {
  await page.locator('#open-settings').click()
  await accountRow('Messenger').locator('.move-down').click()

  await expect(page.locator('.channel').first().locator('.channel-name')).toHaveText('WhatsApp personal')
  expect((await savedAccounts()).map((a) => a.name)).toEqual([
    'WhatsApp personal',
    'Messenger',
    'WhatsApp work',
  ])
})

test('the ends of the list have their move buttons disabled', async () => {
  await page.locator('#open-settings').click()

  await expect(accountRow('Messenger').locator('.move-up')).toBeDisabled()
  await expect(accountRow('WhatsApp work').locator('.move-down')).toBeDisabled()
})

test('moving an account does not throw the operator back to the first channel', async () => {
  // The operator is working in the third account; tidying the list must not evict them.
  await page.locator('.channel').nth(2).click()
  await expect(page.locator('.channel').nth(2)).toHaveAttribute('aria-selected', 'true')

  await page.locator('#open-settings').click()
  await accountRow('Messenger').locator('.move-down').click()

  await expect(page.locator('.channel[aria-selected="true"] .channel-name')).toHaveText('WhatsApp work')
})
