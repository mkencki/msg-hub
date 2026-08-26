import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

let dataDir

test.beforeEach(async () => {
  // Its own data directory — the test must not touch the operator's real accounts.json.
  dataDir = await mkdtemp(path.join(tmpdir(), 'mhub-e2e-'))
})

test.afterEach(async () => {
  // Windows releases handles after an Electron process with a delay. The cleanup is a
  // courtesy to the temp directory, not an assertion — it must never block the test.
  const cleanup = rm(dataDir, { recursive: true, force: true, maxRetries: 3 }).catch(
    () => {},
  )
  await Promise.race([cleanup, new Promise((done) => setTimeout(done, 3000))])
})

test('the window renders the channel rail and exposes the bridge to the renderer', async () => {
  const electronApp = await electron.launch({ args: ['.', `--user-data-dir=${dataDir}`] })
  const page = await electronApp.firstWindow()

  expect(await page.title()).toBe('M-HUB')
  await expect(page.locator('#channels')).toBeAttached()
  await expect(page.locator('#add-account')).toBeVisible()

  const methods = await page.evaluate(() => Object.keys(window.mHub ?? {}).sort())
  expect(methods).toEqual(
    expect.arrayContaining(['addAccount', 'listAccounts', 'onMessage', 'onUnread', 'switchAccount', 'setOverlay']),
  )

  // A fresh data directory: no accounts, and the IPC channel answers instead of throwing.
  const accounts = await page.evaluate(() => window.mHub.listAccounts())
  expect(accounts).toEqual([])

  await electronApp.close()
})

test('the counter draws a 16x16 overlay and disappears at zero', async () => {
  const electronApp = await electron.launch({ args: ['.', `--user-data-dir=${dataDir}`] })
  const page = await electronApp.firstWindow()

  const result = await page.evaluate(async () => {
    const { drawUnreadBadge } = await import('./renderer.js')
    return { zero: drawUnreadBadge(0), trzy: drawUnreadBadge(3), duzo: drawUnreadBadge(120) }
  })

  expect(result.zero).toBeNull()
  expect(result.trzy).toMatch(/^data:image\/png;base64,/)
  expect(result.duzo).toMatch(/^data:image\/png;base64,/)

  // The main process has to accept the drawn image — setOverlayIcon rejects rubbish.
  await page.evaluate((obrazek) => window.mHub.setOverlay(obrazek), result.trzy)
  await page.evaluate(() => window.mHub.setOverlay(null))

  await electronApp.close()
})

test('the renderer loads accounts at startup without racing the IPC registration', async () => {
  const electronApp = await electron.launch({ args: ['.', `--user-data-dir=${dataDir}`] })
  const page = await electronApp.firstWindow()

  // The renderer calls accounts:list the moment it loads. If the main process registers its
  // channels later, the call throws and the rail stays empty.
  //
  // Aimed at THAT failure rather than at an empty bar. Startup has other things it may
  // legitimately say — a global shortcut another program owns, for one — and a test that
  // demands silence ends up reporting those instead of the race it was written for.
  expect(await page.locator('#message-text').textContent()).not.toMatch(/account/i)

  await electronApp.close()
})
