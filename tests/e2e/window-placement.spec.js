import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

// A profile written on a desk with external monitors, opened on a desk without them. Measured
// on 2026-09-01: a layout carrying x=-1394 y=972 put the window where no screen was, and a
// later one put it on a second monitor the operator was not looking at. Either way the
// application was running and unreachable – the window is what the application IS.
//
// The position in the fixture is deliberately absurd. It is not a place any monitor could be,
// so if the window turns up inside the work area the position was not the thing that decided.
test('a position remembered from another desk does not put the window off the screen', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'mhub-placement-'))
  await writeFile(
    path.join(dataDir, 'layout.json'),
    JSON.stringify({ x: -9999, y: -9999, width: 1280, height: 752, maximized: false }),
    'utf8',
  )

  const electronApp = await electron.launch({ args: ['.', `--user-data-dir=${dataDir}`] })

  const placement = await electronApp.evaluate(async ({ app, BrowserWindow, screen }) => {
    await app.whenReady()
    for (let probe = 0; probe < 50 && BrowserWindow.getAllWindows().length === 0; probe += 1) {
      await new Promise((done) => setTimeout(done, 100))
    }
    const window = BrowserWindow.getAllWindows()[0]
    return { bounds: window.getBounds(), workArea: screen.getPrimaryDisplay().workArea }
  })

  const { bounds, workArea } = placement
  expect(bounds.x).toBeGreaterThanOrEqual(workArea.x)
  expect(bounds.y).toBeGreaterThanOrEqual(workArea.y)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(workArea.x + workArea.width)
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(workArea.y + workArea.height)

  await electronApp.close()
  const cleanup = rm(dataDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([cleanup, new Promise((done) => setTimeout(done, 3000))])
})
