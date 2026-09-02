import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { blankTheViews } from './helpers.js'

// Electron derives the profile directory from the application's name, so version 0.5.0's
// productName moved it: a machine upgrading from an earlier version came up with an empty
// rail while its accounts sat, whole, in the directory the old name had built. This spec
// launches the real application over such a machine – the profile beside the new one,
// under the old name – and asks whether the accounts made it across.
//
// The two directories are siblings inside one temporary root because that is the shape on
// a real machine: both live directly under %APPDATA%.
test('accounts left under the old profile name are picked up on the next start', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'mhub-rename-'))
  const legacy = path.join(root, 'msg-hub')
  const dataDir = path.join(root, 'M-HUB')

  await mkdir(legacy, { recursive: true })
  await writeFile(
    path.join(legacy, 'accounts.json'),
    JSON.stringify({
      wersja: 1,
      konta: [
        { id: 'acc-messenger', nazwa: 'Messenger', platforma: 'messenger', url: 'https://www.messenger.com/', kolor: '#6586ec' },
      ],
    }),
    'utf8',
  )
  // The session behind the account. Leaving this one behind would mean a fresh QR code,
  // which is the difference between an upgrade and an accident.
  //
  // The marker is a file of OUR OWN, not one of Chromium's. The first version of this test
  // wrote a fake "Cookies" and asserted on it afterwards; Chromium owns that name inside a
  // partition it opens, and it replaced the impostor – the CI run of 2026-08-30 failed with
  // ENOENT on exactly that path. What is under test is whether the directory was carried
  // across, so the test carries something only the test can touch.
  await mkdir(path.join(legacy, 'Partitions', 'acc-messenger'), { recursive: true })
  await writeFile(path.join(legacy, 'Partitions', 'acc-messenger', 'session-marker.txt'), 'session', 'utf8')

  const electronApp = await electron.launch({ args: ['.', `--user-data-dir=${dataDir}`] })

  // A view per account, built right after the accounts are read. The window exists before
  // the views do, so the count is polled rather than sampled once.
  const views = await electronApp.evaluate(async ({ app, BrowserWindow }) => {
    await app.whenReady()
    for (let probe = 0; probe < 100; probe += 1) {
      const windows = BrowserWindow.getAllWindows()
      if (windows.length && windows[0].contentView.children.length) break
      await new Promise((done) => setTimeout(done, 100))
    }
    const windows = BrowserWindow.getAllWindows()
    return windows.length ? windows[0].contentView.children.length : 0
  })

  expect(views).toBe(1)

  // The view is real and would otherwise sit there fetching messenger.com for as long as this
  // spec runs, on a runner that executes the suite one worker at a time. What is under test is
  // that a view EXISTS for the migrated account, which the count above already establishes.
  await blankTheViews(electronApp)

  const accounts = JSON.parse(await readFile(path.join(dataDir, 'accounts.json'), 'utf8'))
  expect(accounts.konta ?? accounts.accounts).toHaveLength(1)
  expect(await readFile(path.join(dataDir, 'Partitions', 'acc-messenger', 'session-marker.txt'), 'utf8')).toBe('session')
  // Nothing stays behind to come back to life if the new profile is ever lost.
  expect(existsSync(path.join(legacy, 'accounts.json'))).toBe(false)

  await electronApp.close()
  const cleanup = rm(root, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([cleanup, new Promise((done) => setTimeout(done, 3000))])
})
