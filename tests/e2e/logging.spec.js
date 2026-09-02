import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

let dataDir
let electronApp
let page

test.beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'mhub-logging-'))
  await writeFile(
    path.join(dataDir, 'accounts.json'),
    JSON.stringify({
      version: 2,
      accounts: [
        { id: 'acc-work', name: 'Anna Nowak private', platform: 'whatsapp', url: 'https://web.whatsapp.com/', color: '#2f7d5b' },
      ],
    }),
    'utf8',
  )
  electronApp = await electron.launch({ args: ['.', `--user-data-dir=${dataDir}`] })
  page = await electronApp.firstWindow()
  await page.waitForSelector('body[data-ready="1"]')
})

test.afterEach(async () => {
  await electronApp.close().catch(() => {})
  const cleanup = rm(dataDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([cleanup, new Promise((done) => setTimeout(done, 3000))])
})

const readLog = () => readFile(path.join(dataDir, 'logs', 'm-hub.log'), 'utf8')

// Nothing lands on disk today: the only channel for a message is the status bar, which is
// gone the moment it is dismissed. Someone helping a friend whose app will not sign in has
// nothing to look at.
test('the app writes a log where the operator can find it', async () => {
  await expect.poll(() => readLog().catch(() => null)).not.toBeNull()

  expect(await readLog()).toContain('started')
})

// The log is meant to be sent to somebody. Everything in it has to be safe to hand over,
// which is why an account is recorded by its id and never by the name someone typed in –
// that name is frequently a person.
test('a crash is recorded by account id, not by the name of a person', async () => {
  await expect
    .poll(() =>
      electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.length),
    )
    .toBe(1)

  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]
      .contentView.children[0].webContents.emit('render-process-gone', {}, { reason: 'crashed' })
  })

  await expect.poll(async () => (await readLog()).includes('account-crashed')).toBe(true)
  const log = await readLog()
  expect(log).toContain('account=acc-work')
  expect(log).not.toContain('Anna')
  expect(log).not.toContain('Nowak')
})
