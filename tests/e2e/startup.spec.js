import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

// Its own profile, like every other spec here. Without one this test borrows the operator's:
// it launched with no --user-data-dir, took the default profile, and from the moment a single
// instance lock existed it failed whenever msg-hub happened to be running on the machine —
// the second copy quits on purpose, and Playwright reports an application that would not
// start. Measured 2026-08-25, with the operator's own window open at the time.
test('the app starts and opens exactly one window', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'msghub-startup-'))
  const electronApp = await electron.launch({ args: ['.', `--user-data-dir=${dataDir}`] })

  // A window with no content loaded is not a page as far as Playwright is concerned, so
  // firstWindow() would wait forever. The state is read from the main process instead.
  const titles = await electronApp.evaluate(async ({ app, BrowserWindow }) => {
    await app.whenReady()
    for (let probe = 0; probe < 50 && BrowserWindow.getAllWindows().length === 0; probe += 1) {
      await new Promise((done) => setTimeout(done, 100))
    }
    return BrowserWindow.getAllWindows().map((page) => page.getTitle())
  })

  expect(titles).toEqual(['msg-hub'])

  await electronApp.close()
  const cleanup = rm(dataDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([cleanup, new Promise((done) => setTimeout(done, 3000))])
})
