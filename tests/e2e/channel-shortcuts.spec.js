import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

let dataDir
let electronApp
let page

const account = (n, color) => ({
  id: `acc-${n}`,
  name: `Account ${n}`,
  platform: 'whatsapp',
  url: 'https://web.whatsapp.com/',
  color,
})

test.beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'msghub-keys-'))
  await writeFile(
    path.join(dataDir, 'accounts.json'),
    JSON.stringify({ version: 2, accounts: [account('one', '#2f7d5b'), account('two', '#6586ec'), account('three', '#c9a227')] }),
    'utf8',
  )
  electronApp = await electron.launch({ args: ['.', `--user-data-dir=${dataDir}`] })
  page = await electronApp.firstWindow()
  await page.waitForSelector('body[data-ready="1"]')
  await expect(page.locator('.channel')).toHaveCount(3)
  await expect
    .poll(() =>
      electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.length),
    )
    .toBe(3)
})

test.afterEach(async () => {
  await electronApp.close().catch(() => {})
  const cleanup = rm(dataDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([cleanup, new Promise((done) => setTimeout(done, 3000))])
})

// Playwright's keyboard goes in through the debugger, which bypasses before-input-event
// entirely — measured, the interceptor saw nothing at all. sendInputEvent is the house
// pattern for this (tests/e2e/shortcuts.spec.js) and it goes through the same path a real
// key does. The key is sent INTO AN ACCOUNT VIEW, which is where the keyboard actually is
// for most of the working time and the only reason this interceptor exists.
const pressInView = (key) =>
  electronApp.evaluate(({ BrowserWindow }, code) => {
    const view = BrowserWindow.getAllWindows()[0].contentView.children[0]
    view.webContents.sendInputEvent({ type: 'keyDown', keyCode: code, modifiers: ['control'] })
    view.webContents.sendInputEvent({ type: 'keyUp', keyCode: code, modifiers: ['control'] })
  }, key)

const selectedChannel = () =>
  page.locator('.channel[aria-selected="true"]').getAttribute('data-account-id')

const activeView = () =>
  electronApp.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    const index = w.contentView.children.findIndex((v) => v.getBounds().height > 0)
    return index
  })

// Reaching an account without the mouse is the difference between a hub and a window full
// of tabs. The rail's channels are real buttons, but in normal use the keyboard is inside
// an account page, where Tab never reaches them.
test('Ctrl+2 switches to the second channel', async () => {
  expect(await selectedChannel()).toBe('acc-one')

  await pressInView('2')

  await expect.poll(selectedChannel).toBe('acc-two')
  await expect.poll(activeView).toBe(1)
})

test('the order of the shortcuts is the order of the rail', async () => {
  await pressInView('3')
  await expect.poll(selectedChannel).toBe('acc-three')

  await pressInView('1')
  await expect.poll(selectedChannel).toBe('acc-one')
})

// Nine shortcuts and three accounts: the other six have to do nothing rather than throw.
test('a shortcut past the end of the rail changes nothing', async () => {
  await pressInView('2')
  await expect.poll(selectedChannel).toBe('acc-two')

  await pressInView('7')

  await expect.poll(selectedChannel).toBe('acc-two')
})

// register() answers with a boolean and says nothing when another program already owns the
// combination. Silence would look exactly like a shortcut that works, so the contract has two
// halves and both are asserted: either the app holds the combination, or it says out loud
// that it could not get it.
//
// Testing only the first half is testing the machine this happens to run on. A global
// shortcut is a system-wide exclusive, and during a full suite run the previous spec's
// application is sometimes still shutting down and still holding it — measured, one run in
// four. That is not a defect; it is precisely the case the second half exists for.
test('the global shortcut is either held, or its refusal is said out loud', async () => {
  const registered = await electronApp.evaluate(({ globalShortcut }) =>
    globalShortcut.isRegistered('Control+Shift+Space'),
  )

  if (registered) {
    await expect(page.locator('#message')).toBeHidden()
    return
  }
  await expect(page.locator('#message-text')).toContainText('Control+Shift+Space')
})
