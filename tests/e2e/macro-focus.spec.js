import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

let dataDir
let electronApp
let page

test.beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'mhub-focus-'))
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
  await page.evaluate(() => window.mHub.saveMacro({ name: 'Greeting', text: 'Good morning' }))
})

test.afterEach(async () => {
  await electronApp.close().catch(() => {})
  const cleanup = rm(dataDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([cleanup, new Promise((done) => setTimeout(done, 3000))])
})

const viewHasFocus = () =>
  electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].contentView.children[0].webContents.isFocused(),
  )

// Ctrl+; deliberately moves focus to the renderer, or the palette opens and cannot be typed
// in. Nothing in this application moves it back afterwards – and yet it comes back, because
// closing a <dialog> returns focus to what held it before, and here that is a NATIVE view
// sitting above the renderer rather than an element inside it.
//
// That is worth a test precisely because nobody wrote it. Section 6.2 of the design says
// "the operator sends the message by pressing Enter", which is the single most frequent
// thing anyone does here; it currently works by a guarantee this code never asked for.
test('after inserting a macro the keyboard is back in the account', async () => {
  // The precondition is established rather than assumed, and asserted before the thing under
  // test: a window that is not in front has no keyboard to give anybody, and focus() inside
  // one does nothing at all. Without this the test fails on a busy machine and points at the
  // wrong thing – measured, once in four full suite runs.
  await electronApp.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    w.show()
    w.focus()
    w.contentView.children[0].webContents.focus()
  })
  await expect.poll(viewHasFocus).toBe(true)

  // The real path: the keyboard is inside the account page and Ctrl+; is what opens the
  // palette from there. Clicking the button with a mouse would move focus for a different
  // reason and prove nothing about this one.
  await electronApp.evaluate(({ BrowserWindow }) => {
    const view = BrowserWindow.getAllWindows()[0].contentView.children[0]
    view.webContents.sendInputEvent({ type: 'keyDown', keyCode: ';', modifiers: ['control'] })
    view.webContents.sendInputEvent({ type: 'keyUp', keyCode: ';', modifiers: ['control'] })
  })
  await expect(page.locator('#macros-dialog')).toBeVisible()
  expect(await viewHasFocus()).toBe(false)

  await page.locator('#macro-list li').first().click()

  await expect.poll(viewHasFocus).toBe(true)
})

// Measured 2026-08-25: with no editable field focused in the page, webContents.paste() does
// nothing AT ALL and says nothing about it – the probe found activeElement on BODY and both
// fields empty. The status bar nonetheless announced the macro as inserted. The app cannot
// find out whether the paste landed without reading the page, which rule 7.3 forbids, so the
// right move is to stop claiming certainty rather than to go and get it.
test('the status bar says what the app knows, and names where it went', async () => {
  await page.locator('#open-macros').click()
  await page.locator('#macro-list li').first().click()

  const message = page.locator('#message-text')
  await expect(message).toBeVisible()
  await expect(message).toContainText('Greeting')
  await expect(message).toContainText('Account one')
  // The two things it must not do: claim the text reached the message box, and imply the
  // app might press Enter.
  await expect(message).not.toContainText('Inserted')
  await expect(message).toContainText('Check')
})

// The account a macro is about to go into is named in the palette BEFORE the choice, not
// only in the message afterwards. Sending a client's quote to the wrong account is what the
// README calls the only real risk of this product.
test('the palette names the account it will insert into', async () => {
  await page.locator('#open-macros').click()

  await expect(page.locator('#target-name')).toHaveText('Account one')
  await expect(page.locator('#target-chip')).toBeVisible()
})
