import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

let dataDir
let electronApp
let page

test.beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'mhub-recovery-'))
  await writeFile(
    path.join(dataDir, 'accounts.json'),
    JSON.stringify({
      version: 2,
      accounts: [
        { id: 'acc-one', name: 'Account one', platform: 'whatsapp', url: 'https://web.whatsapp.com/', color: '#2f7d5b' },
      ],
    }),
    'utf8',
  )
  electronApp = await electron.launch({ args: ['.', `--user-data-dir=${dataDir}`] })
  page = await electronApp.firstWindow()
  await page.waitForSelector('body[data-ready="1"]')
  await expect
    .poll(() =>
      electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.length),
    )
    .toBe(1)

  // The service page is not reachable from a test machine and none of this is about the
  // service page. about:blank gives the view a real document to lose when it reloads.
  await electronApp.evaluate(async ({ BrowserWindow }) => {
    const view = BrowserWindow.getAllWindows()[0].contentView.children[0]
    view.webContents.stop()
    await view.webContents.loadURL('about:blank').catch(() => {})
  })
})

test.afterEach(async () => {
  await electronApp.close().catch(() => {})
  const cleanup = rm(dataDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([cleanup, new Promise((done) => setTimeout(done, 3000))])
})

const mark = () =>
  electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]
      .contentView.children[0].webContents.executeJavaScript('window.__mark = "here", 1'),
  )

const markSurvives = () =>
  electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]
      .contentView.children[0].webContents.executeJavaScript('window.__mark === "here"'),
  )

// Really crashing the renderer takes Playwright's own connection down with it — measured,
// the run ends with "Target crashed" before any assertion runs. What is under test here is
// what the app DOES when Electron reports a dead renderer; delivering that report is
// Electron's job, so the report is delivered directly.
const reportCrash = () =>
  electronApp.evaluate(({ BrowserWindow }) => {
    const view = BrowserWindow.getAllWindows()[0].contentView.children[0]
    view.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 })
  })

// Playwright's keyboard goes in through the debugger and never reaches before-input-event
// — measured while writing tests/e2e/channel-shortcuts.spec.js, where the interceptor saw
// nothing at all. sendInputEvent takes the path a real key takes.
const pressInWindow = (key) =>
  electronApp.evaluate(({ BrowserWindow }, code) => {
    const w = BrowserWindow.getAllWindows()[0]
    w.webContents.sendInputEvent({ type: 'keyDown', keyCode: code, modifiers: ['control'] })
    w.webContents.sendInputEvent({ type: 'keyUp', keyCode: code, modifiers: ['control'] })
  }, key)

const pressInView = (key) =>
  electronApp.evaluate(({ BrowserWindow }, code) => {
    const view = BrowserWindow.getAllWindows()[0].contentView.children[0]
    view.webContents.focus()
    view.webContents.sendInputEvent({ type: 'keyDown', keyCode: code, modifiers: ['control'] })
    view.webContents.sendInputEvent({ type: 'keyUp', keyCode: code, modifiers: ['control'] })
  }, key)

// A laptop coming back from sleep leaves WhatsApp Web saying the computer is not connected,
// and until now the only cure was restarting the whole application — taking every other
// account down with it. F12 and Ctrl+R inside the developer tools did work, which is a way
// out for whoever knows it is there and no way out at all for anyone else.
test('Ctrl+R reloads the account the operator is looking at', async () => {
  await mark()
  expect(await markSurvives()).toBe(true)

  await pressInView('R')

  await expect.poll(markSurvives).toBe(false)
})

// The same key inside the app's own window would tear down the interface, the rail and the
// status bar, and take the account views with it.
test('Ctrl+R in the app window reloads the account, not the interface', async () => {
  await mark()
  await page.evaluate(() => {
    window.__interfaceMark = 'here'
  })

  await pressInWindow('R')
  await expect.poll(markSurvives).toBe(false)

  expect(await page.evaluate(() => window.__interfaceMark)).toBe('here')
})

// A renderer that has died shows a blank rectangle and nothing else. Saying so, and saying
// which account it happened to, is the difference between a bug report and a restart.
test('a crashed account says so and offers its way back', async () => {
  await reportCrash()

  await expect(page.locator('#message')).toBeVisible()
  await expect(page.locator('#message-text')).toContainText('Account one')
  await expect(page.locator('#reload-account')).toBeVisible()
})

test('the offered reload really reloads, and the message gets out of the way', async () => {
  await mark()
  await reportCrash()
  await expect(page.locator('#reload-account')).toBeVisible()

  await page.locator('#reload-account').click()

  // The page is gone and built again — which is what reloading is. The address does not
  // change, because reloading is not navigating.
  await expect.poll(markSurvives).toBe(false)
  await expect(page.locator('#message')).toBeHidden()
})

// Reloading throws away whatever is half-typed in the composer, so it stays something the
// operator asks for. Waking the machine only says the accounts may need it.
test('waking from sleep offers a reload rather than performing one', async () => {
  await mark()

  await electronApp.evaluate(({ powerMonitor }) => powerMonitor.emit('resume'))

  await expect(page.locator('#reload-account')).toBeVisible()
  expect(await markSurvives()).toBe(true)
})
