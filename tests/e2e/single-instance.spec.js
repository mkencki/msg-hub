import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import electronBinary from 'electron'

let dataDir
let electronApp
let page

// Playwright's launcher waits for an application that stays up, and the whole point of the
// second copy is that it does not. So it is started the plain way and only its exit code is
// read.
function startSecondCopy() {
  const child = spawn(electronBinary, ['.', `--user-data-dir=${dataDir}`], { stdio: 'ignore' })
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('the second copy was still running after 20 seconds'))
    }, 20000)
    child.once('exit', (code) => {
      clearTimeout(timer)
      resolve(code)
    })
  })
}

test.beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'mhub-single-'))
  electronApp = await electron.launch({ args: ['.', `--user-data-dir=${dataDir}`] })
  page = await electronApp.firstWindow()
  await page.waitForSelector('body[data-ready="1"]')
})

test.afterEach(async () => {
  await electronApp.close().catch(() => {})
  const cleanup = rm(dataDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([cleanup, new Promise((done) => setTimeout(done, 3000))])
})

// Two copies over one profile is not a tidiness problem. Each keeps its own picture of the
// cookie stores, the one that loses the write loses its sign-in, and on WhatsApp a lost
// sign-in means scanning a QR code again. Which copy loses is not predictable.
test('a second copy over the same profile gives up instead of opening a window', async () => {
  expect(await startSecondCopy()).toBe(0)

  const windows = await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)
  expect(windows).toBe(1)
})

// Giving up silently would look like the app being broken. Someone who launches it again is
// asking to see it, and usually it is sitting in the tray.
test('launching again brings the copy already running back into view', async () => {
  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide())
  await expect
    .poll(() => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()))
    .toBe(false)

  await startSecondCopy()

  await expect
    .poll(() => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()))
    .toBe(true)
})
