import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

let dataDir
let electronApp
let page

test.beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'msghub-services-'))
  electronApp = await electron.launch({ args: ['.', `--user-data-dir=${dataDir}`] })
  page = await electronApp.firstWindow()
  await page.waitForSelector('body[data-ready="1"]')
})

test.afterEach(async () => {
  await electronApp.close().catch(() => {})
  const cleanup = rm(dataDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([cleanup, new Promise((done) => setTimeout(done, 3000))])
})

const savedAccounts = async () =>
  JSON.parse(await readFile(path.join(dataDir, 'accounts.json'), 'utf8')).accounts

const addAccount = async (name, platform) => {
  await page.locator('#add-account').click()
  await page.locator('#account-dialog input[name="name"]').fill(name)
  await page.locator('#account-dialog select[name="platform"]').selectOption(platform)
  await page.locator('#save-account').click()
  await expect(page.locator('#account-dialog')).toBeHidden()
}

// An account may host a whole service, not only a messenger — the widening the design
// document took on 2026-08-25. Until now the picker offered two messengers and nothing else.
test('LinkedIn and Facebook can be added like any other account', async () => {
  const offered = await page
    .locator('#account-dialog select[name="platform"] option')
    .evaluateAll((options) => options.map((o) => o.value))
  expect(offered).toEqual(['whatsapp', 'messenger', 'linkedin', 'facebook'])
})

// The apex host answers "Checking your browser - reCAPTCHA" — measured with curl, twice. The
// entry point has to be the www host and the feed path, or the account opens on a wall.
test('LinkedIn is entered at the feed, never at the apex', async () => {
  await addAccount('LinkedIn work', 'linkedin')

  const [account] = await savedAccounts()
  expect(account.url).toBe('https://www.linkedin.com/feed/')
})

test('Facebook is entered at www', async () => {
  await addAccount('Facebook', 'facebook')

  const [account] = await savedAccounts()
  expect(account.url).toBe('https://www.facebook.com/')
})

// A rail where "(3)" means three conversations on one channel and a sum of eight badge
// sources on the next is a rail where neither number can be trusted.
test('a whole service shows no count, whatever its page calls itself', async () => {
  await addAccount('LinkedIn work', 'linkedin')
  await expect
    .poll(() =>
      electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.length),
    )
    .toBe(1)

  const counted = await electronApp.evaluate(({ BrowserWindow }) => {
    const view = BrowserWindow.getAllWindows()[0].contentView.children[0]
    view.webContents.emit('page-title-updated', {}, '(12) LinkedIn')
    return true
  })
  expect(counted).toBe(true)

  await expect(page.locator('#status-unread')).not.toContainText('12')
  await expect(page.locator('.channel-meta')).not.toContainText('12')
})

// Each account keeps its own session, so Messenger and Facebook are two sign-ins even for
// one Meta identity. That is the cost of the isolation and it has to be true, not assumed.
test('Facebook and Messenger are separate sessions even for one identity', async () => {
  await addAccount('Messenger', 'messenger')
  await addAccount('Facebook', 'facebook')

  const accounts = await savedAccounts()
  const partitions = accounts.map((a) => `persist:${a.id}`)
  expect(new Set(partitions).size).toBe(2)

  const shared = await electronApp.evaluate(async ({ session }, ids) => {
    const first = session.fromPartition(`persist:${ids[0]}`)
    const second = session.fromPartition(`persist:${ids[1]}`)
    await first.cookies.set({ url: 'https://www.facebook.com', name: 'probe', value: 'one' })
    return (await second.cookies.get({ name: 'probe' })).length
  }, accounts.map((a) => a.id))
  expect(shared).toBe(0)
})

// The switch has to reach the permission, or it is decoration. What decides whether anything
// ever pops up is the answer the page gets when it asks the browser.
const askForNotifications = () =>
  electronApp.evaluate(async ({ BrowserWindow }) => {
    const view = BrowserWindow.getAllWindows()[0].contentView.children[0]
    view.webContents.stop()
    await view.webContents.loadURL('about:blank').catch(() => {})
    return view.webContents.executeJavaScript('Notification.requestPermission()')
  })

test('a whole service is refused notifications until the operator allows them', async () => {
  await addAccount('Facebook', 'facebook')
  await expect
    .poll(() =>
      electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.length),
    )
    .toBe(1)

  expect(await askForNotifications()).toBe('denied')

  // The operator says yes, in the same place they named the account.
  await page.locator('#open-settings').click()
  await page.locator('#account-list .edit-account').first().click()
  await page.locator('#account-dialog input[name="notifications"]').check()
  await page.locator('#save-account').click()
  await expect(page.locator('#account-dialog')).toBeHidden()

  expect(await askForNotifications()).toBe('granted')
})

// And the other way round, because an account that has been shouting must be able to stop.
test('a messenger the operator silences stops being allowed to interrupt', async () => {
  await addAccount('WhatsApp', 'whatsapp')
  await expect
    .poll(() =>
      electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.length),
    )
    .toBe(1)

  expect(await askForNotifications()).toBe('granted')

  await page.locator('#open-settings').click()
  await page.locator('#account-list .edit-account').first().click()
  await page.locator('#account-dialog input[name="notifications"]').uncheck()
  await page.locator('#save-account').click()
  await expect(page.locator('#account-dialog')).toBeHidden()

  expect(await askForNotifications()).toBe('denied')
})
