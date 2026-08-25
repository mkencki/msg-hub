import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

let dataDir
let electronApp
let page

test.beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'msghub-vars-'))
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
})

test.afterEach(async () => {
  await electronApp.close().catch(() => {})
  const cleanup = rm(dataDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([cleanup, new Promise((done) => setTimeout(done, 3000))])
})

// What actually reached the clipboard, which is the only thing that matters here — the page
// itself is not reachable from a test machine and is none of this test's business.
const clipboardText = () => electronApp.evaluate(({ clipboard }) => clipboard.readText())

const pick = async (name) => {
  await page.locator('#open-macros').click()
  await page.locator('#macro-search').fill(name)
  await expect(page.locator('#macro-list li')).toHaveCount(1)
  await page.locator('#macro-list li').first().click()
}

test('a macro with placeholders asks before it goes anywhere', async () => {
  await page.evaluate(() =>
    window.msgHub.saveMacro({ name: 'Quote', text: 'Hello {name}, the quote for {company} is ready.' }),
  )
  await electronApp.evaluate(({ clipboard }) => clipboard.writeText('nothing yet'))

  await pick('Quote')

  await expect(page.locator('#variables-dialog')).toBeVisible()
  // Nothing has been put anywhere while the question is still open.
  expect(await clipboardText()).toBe('nothing yet')

  await page.locator('#variables-dialog input').first().fill('Anna')
  await page.locator('#variables-dialog input').nth(1).fill('Kowalski sp. z o.o.')
  await page.locator('#fill-variables').click()

  await expect.poll(clipboardText).toBe('Hello Anna, the quote for Kowalski sp. z o.o. is ready.')
})

// Every macro that exists today takes this path, and it may not change by a character.
test('a macro without placeholders is not interrupted and not altered', async () => {
  await page.evaluate(() => window.msgHub.saveMacro({ name: 'Greeting', text: 'Good morning.' }))

  await pick('Greeting')

  await expect(page.locator('#variables-dialog')).toBeHidden()
  await expect.poll(clipboardText).toBe('Good morning.')
})

test('the date fills itself rather than being asked for', async () => {
  await page.evaluate(() => window.msgHub.saveMacro({ name: 'Dated', text: 'Sent on {date}.' }))

  await pick('Dated')

  await expect(page.locator('#variables-dialog')).toBeHidden()
  const today = new Date().toISOString().slice(0, 10)
  await expect.poll(clipboardText).toBe(`Sent on ${today}.`)
})

// Backing out has to leave nothing behind — least of all a half-filled message on the
// clipboard, which is the one thing that could reach a conversation by accident.
test('cancelling the question inserts nothing at all', async () => {
  await page.evaluate(() => window.msgHub.saveMacro({ name: 'Quote', text: 'Hello {name}.' }))
  await electronApp.evaluate(({ clipboard }) => clipboard.writeText('nothing yet'))

  await pick('Quote')
  await expect(page.locator('#variables-dialog')).toBeVisible()
  await page.locator('#cancel-variables').click()

  await expect(page.locator('#variables-dialog')).toBeHidden()
  expect(await clipboardText()).toBe('nothing yet')
})
