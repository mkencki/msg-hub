import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

// Geometry from src/main/main.js. The account view begins just past the rail, so its x is the
// simplest proof of how much room the rail actually takes.
const COLLAPSED = 48
const EXPANDED = 162
const MARGIN = 10

// Points inside the window's content area. ON_RAIL is inside the rail whether it is
// collapsed (48 wide) or expanded (162); AWAY is out in the account well.
const ON_RAIL = { x: 24, y: 300 }
const AWAY = { x: 600, y: 300 }

let dataDir
let electronApp
let page
// BrowserWindow.getAllWindows() puts the NEWEST window first — measured, opening a second
// one moved the app's own window to index 1. One test here deliberately opens another
// window, so nothing may reach for the app's window by position.
let appWindowId

async function launchApp() {
  electronApp = await electron.launch({ args: ['.', `--user-data-dir=${dataDir}`] })
  page = await electronApp.firstWindow()
  await page.waitForSelector('body[data-ready="1"]')
  appWindowId = await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].id)
}

async function addAccount(name = 'WhatsApp test') {
  await page.locator('#add-account').click()
  await page.locator('#account-dialog input[name="name"]').fill(name)
  await page.locator('#save-account').click()
  await expect(page.locator('#account-dialog')).toBeHidden()
}

// The rail reacts to the POINTER, and Playwright's hover() cannot move the physical one:
// it dispatches an event through the debugger while the real cursor stays wherever the
// person running the tests left it. Chromium then corrects the fiction on the next real
// mouse event — measured 2026-08-25, mouseenter arrived with clientX 24 and a mouseleave
// followed 20 ms later with clientX 1260, the true cursor position. Whether the assertion
// or the correction got there first decided the result, which is why this file passed 20
// runs out of 20 on an idle machine and failed once in 8 while a second Electron window
// was taking the foreground.
//
// So the premise is made true instead of pretended: the WINDOW is moved until the wanted
// point of its content sits under the physical cursor. The operator's mouse is never
// touched — a test suite that grabbed the mouse would be worse than a flaky one.
const parkPointer = ({ x, y }) =>
  electronApp.evaluate(({ BrowserWindow, screen }, { id, x, y }) => {
    const window = BrowserWindow.fromId(id)
    const cursor = screen.getCursorScreenPoint()
    const content = window.getContentBounds()
    window.setContentBounds({ ...content, x: Math.round(cursor.x - x), y: Math.round(cursor.y - y) })
  }, { id: appWindowId, x, y })

const viewLeftEdge = () =>
  electronApp.evaluate(({ BrowserWindow }, id) => {
    const w = BrowserWindow.fromId(id)
    return w.contentView.children.find((v) => v.getBounds().height > 0)?.getBounds().x ?? null
  }, appWindowId)

test.beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'mhub-rail-'))
  await launchApp()
  // Nothing here is about hovering, so the cursor is parked out of the rail's way. Without
  // this a machine whose cursor happens to rest over the left edge of the window would see
  // the rail expand on its own, entirely correctly, and every collapsed-state assertion
  // below would fail.
  await parkPointer(AWAY)
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
  await expect.poll(viewLeftEdge).toBe(COLLAPSED + MARGIN)
})

test('hovering expands the rail and pushes the account view aside', async () => {
  await addAccount()
  await parkPointer(ON_RAIL)

  await page.locator('#rail').hover()

  await expect.poll(viewLeftEdge).toBe(EXPANDED + MARGIN)
  await expect(page.locator('.channel-name')).toBeVisible()
})

// Losing the foreground is not the operator moving away. Chromium reports it as a
// mouseleave all the same, carrying the pointer position it had all along — measured
// 2026-08-25 at clientX 24 inside a rail box of 0..162, with the cursor never moved, and
// the rail collapsed on 3 attempts out of 3. Acting on it shuts the rail under the cursor
// of someone who never touched it, and it stays shut after they click back.
//
// The report is reproduced rather than awaited. Waiting for Chromium to deliver the real
// one means racing whatever else is changing the foreground on the machine, and the whole
// point of the rule is what happens when other windows are doing exactly that. The
// decision itself is pinned case by case in tests/shell.test.js.
test('a leave reported while another window holds the foreground leaves the rail open', async () => {
  await addAccount()
  await parkPointer(ON_RAIL)
  await page.locator('#rail').hover()
  await expect.poll(viewLeftEdge).toBe(EXPANDED + MARGIN)

  // Another window genuinely takes the foreground, rather than blur() being asked to
  // pretend. On Windows a window that nothing replaces stays the foreground window and
  // isFocused() goes on answering true — measured, blur() alone left it focused in 16 runs
  // out of 20.
  await electronApp.evaluate(({ BrowserWindow }) => {
    globalThis.__thief = new BrowserWindow({ width: 240, height: 160 })
    globalThis.__thief.focus()
  })
  await expect
    .poll(() => electronApp.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id).isFocused(), appWindowId))
    .toBe(false)

  await page.evaluate(() => window.mHub.hoverRail(false, true))

  expect(await viewLeftEdge()).toBe(EXPANDED + MARGIN)
  await expect(page.locator('.channel-name')).toBeVisible()

  await electronApp.evaluate(() => globalThis.__thief?.destroy())
})

// Holding a report back is only half an answer. The pointer really may have left while the
// app was in the background, and a rail held open on a stale hover would never close again:
// Chromium has already stopped considering the pointer inside, so it will send no second
// leave. Coming back to the foreground therefore has to ask where the pointer is now.
test('coming back to the foreground settles a rail held open on a stale hover', async () => {
  await addAccount()
  await parkPointer(AWAY)
  await page.evaluate(() => window.mHub.hoverRail(true))
  await expect.poll(viewLeftEdge).toBe(EXPANDED + MARGIN)

  await electronApp.evaluate(({ BrowserWindow }) => {
    globalThis.__thief = new BrowserWindow({ width: 240, height: 160 })
    globalThis.__thief.focus()
  })
  await expect
    .poll(() => electronApp.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id).isFocused(), appWindowId))
    .toBe(false)
  await page.evaluate(() => window.mHub.hoverRail(false, true))
  expect(await viewLeftEdge()).toBe(EXPANDED + MARGIN)

  await electronApp.evaluate(({ BrowserWindow }, id) => {
    globalThis.__thief?.destroy()
    BrowserWindow.fromId(id).focus()
  }, appWindowId)

  await expect.poll(viewLeftEdge).toBe(COLLAPSED + MARGIN)
})

test('the cursor leaving collapses the rail again', async () => {
  await addAccount()
  await page.locator('#rail').hover()
  await expect.poll(viewLeftEdge).toBe(EXPANDED + MARGIN)

  await page.locator('#status-bar').hover()

  await expect.poll(viewLeftEdge).toBe(COLLAPSED + MARGIN)
})

test('a pinned rail stays expanded after the cursor leaves', async () => {
  await addAccount()
  await page.locator('#rail').hover()
  await page.locator('#pin-rail').click()

  await page.locator('#status-bar').hover()

  await expect.poll(viewLeftEdge).toBe(EXPANDED + MARGIN)
})

test('unpinning returns to collapsing', async () => {
  await addAccount()
  await page.locator('#rail').hover()
  await page.locator('#pin-rail').click()
  await expect.poll(viewLeftEdge).toBe(EXPANDED + MARGIN)

  await page.locator('#pin-rail').click()
  await page.locator('#status-bar').hover()

  await expect.poll(viewLeftEdge).toBe(COLLAPSED + MARGIN)
})

test('a pinned rail survives closing the application', async () => {
  await addAccount()
  await page.locator('#rail').hover()
  await page.locator('#pin-rail').click()
  await expect.poll(viewLeftEdge).toBe(EXPANDED + MARGIN)
  await electronApp.close()

  await launchApp()

  await expect.poll(viewLeftEdge).toBe(EXPANDED + MARGIN)
  await expect(page.locator('#rail')).toHaveClass(/pinned/)
})

// Collapsing must not take away the thing the rail exists for: telling accounts apart.
test('a collapsed rail still carries the channel colour', async () => {
  await addAccount()

  await expect(page.locator('.channel .chip')).toBeVisible()
  await expect(page.locator('.channel-name')).toBeHidden()
})
