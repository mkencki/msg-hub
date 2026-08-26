import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { blankTheViews } from './helpers.js'

let dataDir
let electronApp
let page

test.beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'mhub-nav-'))
  await writeFile(
    path.join(dataDir, 'accounts.json'),
    JSON.stringify({
      version: 2,
      accounts: [
        { id: 'acc-one', name: 'Messenger', platform: 'messenger', url: 'https://www.messenger.com/', color: '#6586ec' },
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

  // None of this is about the service page. about:blank gives the view a real script context
  // to open windows from, which is the thing under test.
  //
  // Replacing the load in flight was the first attempt at this and it lost the race one full
  // suite run in three — see blankTheViews, which waits for the real page to land first.
  await blankTheViews(electronApp)
  await expect
    .poll(() =>
      electronApp.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].contentView.children[0].webContents.getURL(),
      ),
    )
    .toBe('about:blank')
})

test.afterEach(async () => {
  await electronApp.close().catch(() => {})
  const cleanup = rm(dataDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([cleanup, new Promise((done) => setTimeout(done, 3000))])
})

const openFromView = (address) =>
  electronApp.evaluate(
    ({ BrowserWindow }, target) =>
      BrowserWindow.getAllWindows()[0]
        .contentView.children[0].webContents.executeJavaScript(`window.open(${JSON.stringify(target)}), 1`),
    address,
  )

const windowCount = () => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)

// A page asking for a window used to get a BARE Electron window — no address bar, no back,
// no reload — carrying the account's signed-in session. Sign-in flows genuinely need a
// window, so the answer is a controlled one rather than a refusal.
test('the service opening its own sign-in gets a window that is locked down', async () => {
  await openFromView('https://www.messenger.com/login')

  await expect.poll(windowCount).toBe(2)
  const child = await electronApp.evaluate(({ BrowserWindow }) => {
    const created = BrowserWindow.getAllWindows().find((w) => w.getTitle() !== 'M-HUB')
    const preferences = created.webContents.getLastWebPreferences()
    return {
      title: created.getTitle(),
      hasParent: Boolean(created.getParentWindow()),
      sandbox: preferences.sandbox,
      contextIsolation: preferences.contextIsolation,
      nodeIntegration: preferences.nodeIntegration,
    }
  })

  expect(child.title).toBe('https://www.messenger.com')
  expect(child.hasParent).toBe(true)
  expect(child.sandbox).toBe(true)
  expect(child.contextIsolation).toBe(true)
  expect(child.nodeIntegration).toBe(false)
})

// A window without an address bar must not be able to call itself something it is not.
test('a child window cannot rename itself', async () => {
  await openFromView('https://www.messenger.com/login')
  await expect.poll(windowCount).toBe(2)

  // The page really does try to rename itself, rather than the event being faked: emitting
  // page-title-updated by hand proves nothing, because it is Electron that applies the title
  // and preventDefault is what stops it. The pending load has to be stopped first, or
  // loading anything else over it comes back as ERR_FAILED.
  const title = await electronApp.evaluate(async ({ BrowserWindow }) => {
    const created = BrowserWindow.getAllWindows().find((w) => w.getTitle() !== 'M-HUB')
    created.webContents.stop()
    // The load it was already attempting is aborted by this one, and Electron reports that
    // abort by rejecting. The document still becomes about:blank, which is all this needs.
    await created.webContents.loadURL('about:blank').catch(() => {})
    await created.webContents.executeJavaScript("document.title = 'Windows Security'")
    await new Promise((done) => setTimeout(done, 300))
    return created.getTitle()
  })

  expect(title).not.toBe('Windows Security')
})

// Meta wraps outgoing links so that each one looks like a facebook.com address. Keeping the
// whole web inside a signed-in view is exactly what this must not do.
test('a wrapped outgoing link never becomes a window of ours', async () => {
  await openFromView('https://l.facebook.com/l.php?u=https%3A%2F%2Fexample.org')

  await expect.poll(windowCount).toBe(1)
})

// shell.openExternal launches whatever the system associates with a scheme, so these must
// not reach it, and they must not open a window either.
test('a scheme that is not a web page opens nothing at all', async () => {
  await openFromView('javascript:alert(1)')
  await openFromView('file:///C:/Windows/System32/calc.exe')
  await openFromView('ms-msdt:/id')

  await expect.poll(windowCount).toBe(1)
})

// The contract has to be attached to every account view, not only to the ones present when
// the window was built.
test('an account added while the app is running gets the same contract', async () => {
  await page.locator('#add-account').click()
  await page.locator('#account-dialog input[name="name"]').fill('Second')
  await page.locator('#save-account').click()
  await expect(page.locator('.channel')).toHaveCount(2)

  await expect
    .poll(() =>
      electronApp.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].contentView.children.every(
          (v) => v.webContents.listenerCount('will-navigate') > 0,
        ),
      ),
    )
    .toBe(true)
})

// Registered on the account's own partition, never on the default session — on the default
// session there is nothing to say WHOSE file is arriving, which is the only thing the
// message adds over the system's own Save dialog.
test('a download is watched on the account that started it, not globally', async () => {
  const wired = await electronApp.evaluate(({ BrowserWindow, session }) => {
    const view = BrowserWindow.getAllWindows()[0].contentView.children[0]
    return {
      onPartition: view.webContents.session.listenerCount('will-download'),
      onDefault: session.defaultSession.listenerCount('will-download'),
    }
  })

  expect(wired.onPartition).toBeGreaterThan(0)
  expect(wired.onDefault).toBe(0)
})
