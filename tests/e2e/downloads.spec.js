import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm, writeFile, readdir } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'

let dataDir
let saveDir
let server
let fileUrl
let electronApp
let page

test.beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'msghub-dl-'))
  saveDir = await mkdtemp(path.join(tmpdir(), 'msghub-saved-'))

  // A real download, because will-download fires for nothing less. A file served as an
  // attachment from a local port is the cheapest real one there is, and it keeps the test off
  // the network and out of anybody's account.
  server = createServer((_request, response) => {
    response.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-disposition': 'attachment; filename="notatka.txt"',
    })
    response.end('msg-hub')
  })
  await new Promise((listening) => server.listen(0, '127.0.0.1', listening))
  fileUrl = `http://127.0.0.1:${server.address().port}/notatka.txt`

  await writeFile(
    path.join(dataDir, 'accounts.json'),
    JSON.stringify({
      version: 2,
      accounts: [
        { id: 'acc-messenger', name: 'Messenger', platform: 'messenger', url: 'https://www.messenger.com/', color: '#6586ec' },
      ],
    }),
    'utf8',
  )
  // Asking where to save would open a modal this test cannot answer, and the question itself
  // is settings.spec.js's business. What is under test here is the banner.
  await writeFile(
    path.join(dataDir, 'layout.json'),
    JSON.stringify({ askWhereToSave: false, downloadDir: saveDir }),
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
  await new Promise((closed) => server.close(closed))
  for (const dir of [dataDir, saveDir]) {
    const cleanup = rm(dir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
    await Promise.race([cleanup, new Promise((done) => setTimeout(done, 3000))])
  }
})

const download = () =>
  electronApp.evaluate(({ BrowserWindow }, url) => {
    const view = BrowserWindow.getAllWindows()[0].contentView.children[0]
    view.webContents.downloadURL(url)
  }, fileUrl)

const saved = async () => (await readdir(saveDir)).sort()

// The banner said "Downloading notatka.txt from Messenger." and then said it for the rest of
// the session: nothing ever asked the download how it went. Reported by the operator with the
// file already on the disk and the banner still up.
test('the banner ends when the download does', async () => {
  await download()

  await expect(page.locator('#message-text')).toContainText('notatka.txt')
  await expect(page.locator('#message-text')).toContainText(/Saved|Zapisano/, { timeout: 20000 })
  expect(await saved()).toEqual(['notatka.txt'])
})

// A success does not need dismissing by hand. A failure does — it is the one the operator has
// to notice.
test('a finished download takes its banner away on its own', async () => {
  await download()
  await expect(page.locator('#message-text')).toContainText(/Saved|Zapisano/, { timeout: 20000 })

  await expect(page.locator('#message')).toBeHidden({ timeout: 20000 })
})

test('a finished download offers the folder it landed in', async () => {
  await download()

  await expect(page.locator('#show-download')).toBeVisible({ timeout: 20000 })
  await expect(page.locator('#reload-account')).toBeHidden()
})

// Chromium numbers a repeated name only while it is choosing the path itself. Once the
// application sets the path, a second copy would land on top of the first.
test('two files of the same name do not become one', async () => {
  await download()
  await expect(page.locator('#message-text')).toContainText(/Saved|Zapisano/, { timeout: 20000 })

  await download()
  await expect.poll(saved, { timeout: 20000 }).toEqual(['notatka (2).txt', 'notatka.txt'])
})

// The message that is on the bar when a timer fires may not be the message that armed it.
test('a self-hiding message does not take a newer one down with it', async () => {
  await download()
  await expect(page.locator('#message-text')).toContainText(/Saved|Zapisano/, { timeout: 20000 })

  // Something the operator must not miss, arriving while the success is still counting down.
  await electronApp.evaluate(({ BrowserWindow }) => {
    const view = BrowserWindow.getAllWindows()[0].contentView.children[0]
    view.webContents.emit('render-process-gone', {}, { reason: 'crashed' })
  })
  await expect(page.locator('#message-text')).toContainText(/Messenger/)

  // Long enough for the success's own timer to have come and gone.
  await page.waitForTimeout(9000)
  await expect(page.locator('#message')).toBeVisible()
})
