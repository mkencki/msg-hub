import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { blankTheViews } from './helpers.js'

let dataDir
let electronApp
let page

test.beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'mhub-latch-'))
  electronApp = await electron.launch({ args: ['.', `--user-data-dir=${dataDir}`] })
  page = await electronApp.firstWindow()
  await page.waitForSelector('body[data-ready="1"]')
})

test.afterEach(async () => {
  await electronApp.close().catch(() => {})
  const cleanup = rm(dataDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([cleanup, new Promise((done) => setTimeout(done, 3000))])
})

// The window title is where the unread count can be read from outside the application: the
// taskbar overlay is an image Windows owns, and no test can ask it what it is showing. Both
// are fed by the same number, so this is the count, not a proxy for it.
const windowTitle = () =>
  electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle())

const addAccount = async (name, platform) => {
  await page.locator('#add-account').click()
  await page.locator('#account-dialog input[name="name"]').fill(name)
  await page.locator('#account-dialog select[name="platform"]').selectOption(platform)
  await page.locator('#save-account').click()
  await expect(page.locator('#account-dialog')).toBeHidden()
  await expect
    .poll(() =>
      electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.length),
    )
    .toBe(1)
}

// A page with something waiting BLINKS its own title to catch the eye: "(3) WhatsApp" for
// about a second, then "WhatsApp" for the next. Read literally that is three unread, then
// none, then three — and the badge used to follow it exactly, on for a second and off for a
// second, which is what the operator reported on 2026-08-25. The same behaviour is on record
// in docs/design.md section 9, where it is one of the reasons Telegram was left out.
//
// The blink here runs four times faster than a real page so the test costs seconds instead of
// a minute. Nothing else about it differs, and a faster blink is the harder case.
const blinkTitle = async () => {
  await blankTheViews(electronApp)
  return electronApp.evaluate(({ BrowserWindow }) => {
    const view = BrowserWindow.getAllWindows()[0].contentView.children[0]
    return view.webContents.executeJavaScript(
      `window.__blink = setInterval(() => {
         document.title = document.title.startsWith('(') ? 'WhatsApp' : '(3) WhatsApp'
       }, 250); true`,
    )
  })
}

test('a page that blinks its own title does not blink the badge', async () => {
  await addAccount('WhatsApp', 'whatsapp')
  await blinkTitle()

  await expect.poll(windowTitle, { timeout: 5000 }).toBe('M-HUB (3)')

  // Two seconds is eight blinks. Without the latch, at least one sample lands on the bare
  // title — and every sample that does is a second the taskbar spent showing nothing.
  const seen = new Set()
  for (let i = 0; i < 20; i += 1) {
    seen.add(await windowTitle())
    await new Promise((done) => setTimeout(done, 100))
  }
  expect([...seen]).toEqual(['M-HUB (3)'])
})

// The other half of the contract, and the half a careless latch breaks: a count that really
// has reached zero must still clear — and clear without another title event to push it,
// because a page that has gone quiet sends none.
test('a count that really reaches zero still clears itself', async () => {
  await addAccount('WhatsApp', 'whatsapp')
  await blinkTitle()
  await expect.poll(windowTitle, { timeout: 5000 }).toBe('M-HUB (3)')

  await electronApp.evaluate(({ BrowserWindow }) => {
    const view = BrowserWindow.getAllWindows()[0].contentView.children[0]
    return view.webContents.executeJavaScript(
      "clearInterval(window.__blink); document.title = 'WhatsApp'; true",
    )
  })

  await expect.poll(windowTitle, { timeout: 8000 }).toBe('M-HUB')
})

// A number that changes without passing through zero is news, and news waits for nothing.
test('a count that goes up is shown at once', async () => {
  await addAccount('WhatsApp', 'whatsapp')
  await blankTheViews(electronApp)
  await electronApp.evaluate(({ BrowserWindow }) => {
    const view = BrowserWindow.getAllWindows()[0].contentView.children[0]
    return view.webContents.executeJavaScript("document.title = '(1) WhatsApp'; true")
  })
  await expect.poll(windowTitle, { timeout: 5000 }).toBe('M-HUB (1)')

  const before = Date.now()
  await electronApp.evaluate(({ BrowserWindow }) => {
    const view = BrowserWindow.getAllWindows()[0].contentView.children[0]
    return view.webContents.executeJavaScript("document.title = '(4) WhatsApp'; true")
  })
  await expect.poll(windowTitle, { timeout: 2000 }).toBe('M-HUB (4)')
  // Well inside the hold: a rise that waited for it would be the latch making the
  // application slower at the one thing it exists to be quick about.
  expect(Date.now() - before).toBeLessThan(2000)
})
