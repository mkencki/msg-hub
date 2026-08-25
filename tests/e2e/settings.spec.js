import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { clearStatusBar } from './helpers.js'

let dataDir
let electronApp
let page

async function savedAccounts() {
  const content = await readFile(path.join(dataDir, 'accounts.json'), 'utf8')
  return JSON.parse(content).accounts
}

async function fillAccountForm(name, platform) {
  await page.locator('#account-dialog input[name="name"]').fill(name)
  await page.locator('#account-dialog select[name="platform"]').selectOption(platform)
  await page.locator('#save-account').click()
  await expect(page.locator('#account-dialog')).toBeHidden()
}

test.beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'msghub-settings-'))
  electronApp = await electron.launch({ args: ['.', `--user-data-dir=${dataDir}`] })
  page = await electronApp.firstWindow()
  await page.waitForSelector('body[data-ready="1"]')
  await clearStatusBar(page)

  await page.locator('#add-account').click()
  await fillAccountForm('WhatsApp personal', 'whatsapp')
  await page.locator('#add-account').click()
  await fillAccountForm('WhatsApp work', 'whatsapp')
  await expect(page.locator('.channel')).toHaveCount(2)
})

test.afterEach(async () => {
  await electronApp.close().catch(() => {})
  const cleanup = rm(dataDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([cleanup, new Promise((done) => setTimeout(done, 3000))])
})

test('a channel no longer carries a close cross: removal must not be one stray click', async () => {
  await expect(page.locator('.channel .remove-account')).toHaveCount(0)
})

test('settings list every account with its platform', async () => {
  await page.locator('#open-settings').click()

  await expect(page.locator('#settings-dialog')).toBeVisible()
  await expect(page.locator('#account-list li')).toHaveCount(2)
  await expect(page.locator('#account-list li').first()).toContainText('WhatsApp personal')
  await expect(page.locator('#account-list li').first()).toContainText('whatsapp')
})

test('removing an account from settings takes away the entry, the channel and the session', async () => {
  const removedId = (await savedAccounts())[1].id
  await electronApp.evaluate(async ({ session }, id) => {
    await session
      .fromPartition(`persist:${id}`)
      .cookies.set({ url: 'https://example.test', name: 'session', value: 'signed-in' })
  }, removedId)

  await page.locator('#open-settings').click()
  await page.locator('#account-list li', { hasText: 'WhatsApp work' }).locator('.remove-account').click()

  await expect(page.locator('#remove-account-dialog')).toBeVisible()
  await expect(page.locator('#remove-account-dialog')).toContainText('WhatsApp work')
  await page.locator('#confirm-remove-account').click()

  // After the removal the operator stays in settings, with the list refreshed.
  await expect(page.locator('#settings-dialog')).toBeVisible()
  await expect(page.locator('#account-list li')).toHaveCount(1)

  expect((await savedAccounts()).map((a) => a.name)).toEqual(['WhatsApp personal'])
  await page.locator('#close-settings').click()
  await expect(page.locator('.channel')).toHaveCount(1)

  const cookies = await electronApp.evaluate(
    ({ session }, id) => session.fromPartition(`persist:${id}`).cookies.get({ name: 'session' }),
    removedId,
  )
  expect(cookies).toEqual([])
})

test('cancelling a removal touches nothing', async () => {
  await page.locator('#open-settings').click()
  await page.locator('#account-list li', { hasText: 'WhatsApp work' }).locator('.remove-account').click()
  await page.locator('#remove-account-dialog button[value="cancel"]').click()

  await expect(page.locator('#account-list li')).toHaveCount(2)
  expect(await savedAccounts()).toHaveLength(2)
})

test('an account can be added both from settings and from the + button on the rail', async () => {
  await page.locator('#open-settings').click()
  await page.locator('#add-account-from-settings').click()
  await expect(page.locator('#account-dialog')).toBeVisible()
  await fillAccountForm('Messenger', 'messenger')
  await expect(page.locator('.channel')).toHaveCount(3)

  await page.locator('#add-account').click()
  await fillAccountForm('Messenger firmowy', 'messenger')
  await expect(page.locator('.channel')).toHaveCount(4)
})

test('removing the last account leaves an empty rail without an error', async () => {
  await page.locator('#open-settings').click()
  for (const name of ['WhatsApp work', 'WhatsApp personal']) {
    await page.locator('#account-list li', { hasText: name }).locator('.remove-account').click()
    await page.locator('#confirm-remove-account').click()
  }

  await expect(page.locator('#account-list .empty')).toBeVisible()
  await page.locator('#close-settings').click()
  await expect(page.locator('.channel')).toHaveCount(0)
  await expect(page.locator('#message')).toBeHidden()
})

test('removing an account and closing the app raises no exception in the main process', async () => {
  // Regression from 2026-08-24: an account view emitted page-title-updated while being
  // destroyed, and refreshBadge reached for a window that was already gone. Electron then
  // raised a modal "Object has been destroyed" that blocked the process from exiting.
  const stderrOutput = []
  electronApp.process().stderr.on('data', (chunk) => stderrOutput.push(String(chunk)))

  await page.locator('#open-settings').click()
  await page.locator('#account-list li', { hasText: 'WhatsApp work' }).locator('.remove-account').click()
  await page.locator('#confirm-remove-account').click()
  await expect(page.locator('#account-list li')).toHaveCount(1)
  await page.locator('#close-settings').click()

  await electronApp.close()

  expect(stderrOutput.join('')).not.toMatch(/Object has been destroyed|Uncaught Exception/)
})
