import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

// Geometry from src/main/main.js. The account view begins just past the rail, so its x is the
// simplest proof of how much room the rail actually takes.
const ZWINIETA = 48
const ROZWINIETA = 162
const MARGINES = 10

let dataDir
let electronApp
let page

async function launchApp() {
  electronApp = await electron.launch({ args: ['.', `--user-data-dir=${dataDir}`] })
  page = await electronApp.firstWindow()
  await page.waitForSelector('body[data-ready="1"]')
}

async function addAccount(name = 'WhatsApp testowy') {
  await page.locator('#add-account').click()
  await page.locator('#account-dialog input[name="name"]').fill(name)
  await page.locator('#save-account').click()
  await expect(page.locator('#account-dialog')).toBeHidden()
}

const viewLeftEdge = () =>
  electronApp.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    return w.contentView.children.find((v) => v.getBounds().height > 0)?.getBounds().x ?? null
  })

test.beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'msghub-szyna-'))
  await launchApp()
})

test.afterEach(async () => {
  await electronApp.close().catch(() => {})
  const cleanup = rm(dataDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([cleanup, new Promise((done) => setTimeout(done, 3000))])
})

test('the rail starts collapsed, so the account view gets more room', async () => {
  await addAccount()

  // Poll, not a bare read. A channel appears in the rail once the renderer has the account
  // list, but the native view is created by the main process in response to the switch —
  // between the two there is a window in which children is still empty.
  await expect.poll(viewLeftEdge).toBe(ZWINIETA + MARGINES)
})

test('hovering expands the rail and pushes the account view aside', async () => {
  await addAccount()

  await page.locator('#rail').hover()

  await expect.poll(viewLeftEdge).toBe(ROZWINIETA + MARGINES)
  await expect(page.locator('.channel-name')).toBeVisible()
})

test('the cursor leaving collapses the rail again', async () => {
  await addAccount()
  await page.locator('#rail').hover()
  await expect.poll(viewLeftEdge).toBe(ROZWINIETA + MARGINES)

  await page.locator('#status-bar').hover()

  await expect.poll(viewLeftEdge).toBe(ZWINIETA + MARGINES)
})

test('a pinned rail stays expanded after the cursor leaves', async () => {
  await addAccount()
  await page.locator('#rail').hover()
  await page.locator('#pin-rail').click()

  await page.locator('#status-bar').hover()

  await expect.poll(viewLeftEdge).toBe(ROZWINIETA + MARGINES)
})

test('unpinning returns to collapsing', async () => {
  await addAccount()
  await page.locator('#rail').hover()
  await page.locator('#pin-rail').click()
  await expect.poll(viewLeftEdge).toBe(ROZWINIETA + MARGINES)

  await page.locator('#pin-rail').click()
  await page.locator('#status-bar').hover()

  await expect.poll(viewLeftEdge).toBe(ZWINIETA + MARGINES)
})

test('a pinned rail survives closing the application', async () => {
  await addAccount()
  await page.locator('#rail').hover()
  await page.locator('#pin-rail').click()
  await expect.poll(viewLeftEdge).toBe(ROZWINIETA + MARGINES)
  await electronApp.close()

  await launchApp()

  await expect.poll(viewLeftEdge).toBe(ROZWINIETA + MARGINES)
  await expect(page.locator('#rail')).toHaveClass(/pinned/)
})

// Collapsing must not take away the thing the rail exists for: telling accounts apart.
test('a collapsed rail still carries the channel colour', async () => {
  await addAccount()

  await expect(page.locator('.channel .chip')).toBeVisible()
  await expect(page.locator('.channel-name')).toBeHidden()
})
