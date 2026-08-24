import { test, expect, _electron as electron } from '@playwright/test'

test('the app starts and opens exactly one window', async () => {
  const electronApp = await electron.launch({ args: ['.'] })

  // A window with no content loaded is not a page as far as Playwright is concerned, so
  // firstWindow() would wait forever. The state is read from the main process instead.
  const tytuly = await electronApp.evaluate(async ({ app, BrowserWindow }) => {
    await app.whenReady()
    for (let probe = 0; probe < 50 && BrowserWindow.getAllWindows().length === 0; probe += 1) {
      await new Promise((gotowe) => setTimeout(gotowe, 100))
    }
    return BrowserWindow.getAllWindows().map((page) => page.getTitle())
  })

  expect(tytuly).toEqual(['msg-hub'])

  await electronApp.close()
})
