import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

let dataDir
let electronApp
let page

test.beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'mhub-console-'))
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
    const shown = w.contentView.children.find((v) => v.getBounds().height > 0)
    return { view: shown?.getBounds() ?? null, page: w.getContentBounds() }
  })

// Account views bring their own header. Tabs along the top stood face to face with it, so
// account identity competed for space with someone else's chrome.
test('the account view begins to the right of the rail, not under a bar along the top', async () => {
  await addAccount('WhatsApp test')

  // The native view is created asynchronously in the main process, so we wait for it to
  // appear BEFORE measuring anything — otherwise the first assertion gets null and it is
  // impossible to tell a badly placed view from a view that does not exist yet.
  await expect.poll(async () => (await viewRect()).view !== null).toBe(true)
  const { view, page: frame } = await viewRect()

  // The rail collapses, so its width changes — what stays constant is that the view
  // begins BEHIND it on the left and NOT under a bar along the top.
  expect(view.x).toBeGreaterThanOrEqual(48)
  expect(view.y).toBeLessThan(24)
  expect(view.width).toBeLessThan(frame.width - 40)
})

test('switching channels repaints the on-air edge', async () => {
  await addAccount('Messenger work', 'messenger')
  await addAccount('WhatsApp personal', 'whatsapp')

  await page.locator('.channel').first().click()
  const first = await channelColor()

  await page.locator('.channel').nth(1).click()
  const second = await channelColor()

  expect(first).toMatch(/^#?[0-9a-fA-F]{6}$|^rgb/)
  expect(second).not.toBe(first)
})

test('the rail shows the number of new messages next to the account', async () => {
  await addAccount('WhatsApp test')
  const accountId = await page.evaluate(async () => (await window.mHub.listAccounts())[0].id)

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
  await addAccount('WhatsApp test')
  await switchToPolish()
  const accountId = await page.evaluate(async () => (await window.mHub.listAccounts())[0].id)

  const send = (count) =>
    electronApp.evaluate(({ BrowserWindow }, payload) => {
      BrowserWindow.getAllWindows()[0].webContents.send('unread:changed', {
        total: payload.count,
        byAccount: { [payload.id]: payload.count },
      })
    }, { id: accountId, count })

  await send(1)
  await expect(page.locator('.channel .channel-meta')).toHaveText('1 nowa')
  await send(12)
  await expect(page.locator('.channel .channel-meta')).toHaveText('12 nowych')
  await send(0)
  await expect(page.locator('.channel .channel-meta')).toHaveText('brak nowych')
})

test('arrows and Enter insert the selected macro without reaching for the mouse', async () => {
  await addAccount('WhatsApp test')
  await page.evaluate(() => window.mHub.saveMacro({ name: 'Alfa', text: 'alpha content' }))
  await page.evaluate(() => window.mHub.saveMacro({ name: 'Beta', text: 'beta content' }))
  await electronApp.evaluate(({ clipboard }) => clipboard.writeText('whatever was on the clipboard before'))

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
  expect(await electronApp.evaluate(({ clipboard }) => clipboard.readText())).toBe('beta content')
})

// The panel closes on every choice. Without a report the operator cannot tell whether
// the content went in, or into which account — the one real risk this product carries.
test('after inserting, the status bar names the account and leaves Enter to the operator', async () => {
  await addAccount('WhatsApp work')
  await page.evaluate(() => window.mHub.saveMacro({ name: 'Alfa', text: 'alpha content' }))

  await page.keyboard.press('Control+Semicolon')
  await page.locator('#macro-list li').first().click()

  await expect(page.locator('#message')).toBeVisible()
  await expect(page.locator('#message')).toContainText('WhatsApp work')
  await expect(page.locator('#message')).toContainText(/Enter/)
})

test('the insertion report is not an error and carries a different tone', async () => {
  await addAccount('WhatsApp test')
  await page.evaluate(() => window.mHub.saveMacro({ name: 'Alfa', text: 'alpha content' }))

  await page.keyboard.press('Control+Semicolon')
  await page.locator('#macro-list li').first().click()
  await expect(page.locator('#message')).toBeVisible()

  expect(await page.locator('#message').getAttribute('data-tone')).toBe('info')
})

test('a failed insertion lights the error tone', async () => {
  await page.evaluate(() => window.mHub.saveMacro({ name: 'Alfa', text: 'alpha content' }))

  await page.locator('#open-macros').click()
  await page.locator('#macro-list li').first().click()

  await expect(page.locator('#message')).toBeVisible()
  expect(await page.locator('#message').getAttribute('data-tone')).toBe('error')
})
