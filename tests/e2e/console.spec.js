import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

let dataDir
let electronApp
let page

test.beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'msghub-konsola-'))
  electronApp = await electron.launch({ args: ['.', `--user-data-dir=${dataDir}`] })
  page = await electronApp.firstWindow()
  await page.waitForSelector('body[data-ready="1"]')
})

test.afterEach(async () => {
  await electronApp.evaluate(({ clipboard }) => clipboard.clear()).catch(() => {})
  await electronApp.close().catch(() => {})
  const cleanup = rm(dataDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([cleanup, new Promise((done) => setTimeout(done, 3000))])
})

async function addAccount(name, platform = 'whatsapp') {
  await page.locator('#add-account').click()
  await page.locator('#account-dialog input[name="name"]').fill(name)
  await page.locator('#account-dialog select[name="platform"]').selectOption(platform)
  await page.locator('#save-account').click()
  await expect(page.locator('#account-dialog')).toBeHidden()
}

const channelColor = () =>
  page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--channel').trim())

const viewRect = () =>
  electronApp.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    const widoczny = w.contentView.children.find((v) => v.getBounds().height > 0)
    return { widok: widoczny?.getBounds() ?? null, page: w.getContentBounds() }
  })

// Account views bring their own header. Tabs along the top stood face to face with it, so
// account identity competed for space with someone else's chrome.
test('the account view begins to the right of the rail, not under a bar along the top', async () => {
  await addAccount('WhatsApp testowy')

  // The native view is created asynchronously in the main process, so we wait for it to
  // appear BEFORE measuring anything — otherwise the first assertion gets null and it is
  // impossible to tell a badly placed view from a view that does not exist yet.
  await expect.poll(async () => (await viewRect()).widok !== null).toBe(true)
  const { widok, page: ramka } = await viewRect()

  // The rail collapses, so its width changes — what stays constant is that the view
  // begins BEHIND it on the left and NOT under a bar along the top.
  expect(widok.x).toBeGreaterThanOrEqual(48)
  expect(widok.y).toBeLessThan(24)
  expect(widok.width).toBeLessThan(ramka.width - 40)
})

test('switching channels repaints the on-air edge', async () => {
  await addAccount('Messenger firmowy', 'messenger')
  await addAccount('WhatsApp prywatny', 'whatsapp')

  await page.locator('.channel').first().click()
  const first = await channelColor()

  await page.locator('.channel').nth(1).click()
  const second = await channelColor()

  expect(first).toMatch(/^#?[0-9a-fA-F]{6}$|^rgb/)
  expect(second).not.toBe(first)
})

test('the rail shows the number of new messages next to the account', async () => {
  await addAccount('WhatsApp testowy')
  const accountId = await page.evaluate(async () => (await window.msgHub.listAccounts())[0].id)

  await electronApp.evaluate(({ BrowserWindow }, id) => {
    BrowserWindow.getAllWindows()[0].webContents.send('unread:changed', {
      total: 4,
      byAccount: { [id]: 4 },
    })
  }, accountId)

  await expect(page.locator('.channel .channel-meta')).toHaveText('4 new')
})

// The language switch goes through the REAL interface, not the bridge: that also checks
// whether the change reaches content drawn from JS and not merely the strings in the HTML.
// The rail composes its own labels, so it would be the first thing left in English.
async function switchToPolish() {
  await page.locator('#open-settings').click()
  await page.locator('#language-select').selectOption('pl')
  await page.locator('#close-settings').click()
}

test('after switching to Polish the rail inflects the numeral through three forms', async () => {
  await addAccount('WhatsApp testowy')
  await switchToPolish()
  const accountId = await page.evaluate(async () => (await window.msgHub.listAccounts())[0].id)

  const send = (ile) =>
    electronApp.evaluate(({ BrowserWindow }, dane) => {
      BrowserWindow.getAllWindows()[0].webContents.send('unread:changed', {
        total: dane.ile,
        byAccount: { [dane.id]: dane.ile },
      })
    }, { id: accountId, ile })

  await send(1)
  await expect(page.locator('.channel .channel-meta')).toHaveText('1 nowa')
  await send(12)
  await expect(page.locator('.channel .channel-meta')).toHaveText('12 nowych')
  await send(0)
  await expect(page.locator('.channel .channel-meta')).toHaveText('brak nowych')
})

test('arrows and Enter insert the selected macro without reaching for the mouse', async () => {
  await addAccount('WhatsApp testowy')
  await page.evaluate(() => window.msgHub.saveMacro({ name: 'Alfa', text: 'content alfa' }))
  await page.evaluate(() => window.msgHub.saveMacro({ name: 'Beta', text: 'content beta' }))
  await electronApp.evaluate(({ clipboard }) => clipboard.writeText('state-sprzed'))

  await page.keyboard.press('Control+Semicolon')
  await expect(page.locator('#macros-dialog')).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')

  await expect(page.locator('#macros-dialog')).toBeHidden()
  // The panel disappears BEFORE the insertion finishes — insertMacro() closes the dialog
  // and only then waits for the main process. Its disappearance therefore cannot measure
  // the end of the operation; the signal is the status-bar report, which lands once the
  // IPC call resolves.
  await expect(page.locator('#message')).toBeVisible()
  expect(await electronApp.evaluate(({ clipboard }) => clipboard.readText())).toBe('content beta')
})

// The panel closes on every choice. Without a report the operator cannot tell whether
// the content went in, or into which account — the one real risk this product carries.
test('after inserting, the status bar names the account and leaves Enter to the operator', async () => {
  await addAccount('WhatsApp sluzbowy')
  await page.evaluate(() => window.msgHub.saveMacro({ name: 'Alfa', text: 'content alfa' }))

  await page.keyboard.press('Control+Semicolon')
  await page.locator('#macro-list li').first().click()

  await expect(page.locator('#message')).toBeVisible()
  await expect(page.locator('#message')).toContainText('WhatsApp sluzbowy')
  await expect(page.locator('#message')).toContainText(/Enter/)
})

test('the insertion report is not an error and carries a different tone', async () => {
  await addAccount('WhatsApp testowy')
  await page.evaluate(() => window.msgHub.saveMacro({ name: 'Alfa', text: 'content alfa' }))

  await page.keyboard.press('Control+Semicolon')
  await page.locator('#macro-list li').first().click()
  await expect(page.locator('#message')).toBeVisible()

  expect(await page.locator('#message').getAttribute('data-tone')).toBe('info')
})

test('a failed insertion lights the error tone', async () => {
  await page.evaluate(() => window.msgHub.saveMacro({ name: 'Alfa', text: 'content alfa' }))

  await page.locator('#open-macros').click()
  await page.locator('#macro-list li').first().click()

  await expect(page.locator('#message')).toBeVisible()
  expect(await page.locator('#message').getAttribute('data-tone')).toBe('error')
})
