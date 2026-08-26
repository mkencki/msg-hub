import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

let dataDir
let electronApp

// This spec used to launch with args: ['.'] alone, and every other spec in this directory
// passes --user-data-dir. The difference was not deliberate: without the flag the test runs
// against the operator's REAL %APPDATA%\msg-hub, where it left two persistent partitions
// behind and wrote a cookie into a live profile. A test must never touch the data of the
// person running it.
test.beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'mhub-isolation-'))
  electronApp = await electron.launch({ args: ['.', `--user-data-dir=${dataDir}`] })
})

test.afterEach(async () => {
  await electronApp.close().catch(() => {})
  const cleanup = rm(dataDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([cleanup, new Promise((done) => setTimeout(done, 3000))])
})

test('a cookie from one partition is invisible in the other', async () => {
  const result = await electronApp.evaluate(async ({ session }) => {
    const first = session.fromPartition('persist:test-isolation-a')
    const second = session.fromPartition('persist:test-isolation-b')

    await first.cookies.set({ url: 'https://example.test', name: 'sample', value: 'value-a' })

    const inFirst = await first.cookies.get({ name: 'sample' })
    const inSecond = await second.cookies.get({ name: 'sample' })

    return { first: inFirst.length, second: inSecond.length }
  })

  expect(result.first).toBe(1)
  expect(result.second).toBe(0)
})

test('the User-Agent gives away neither Electron nor this application', async () => {
  const { ua, name } = await electronApp.evaluate(async ({ app }) => ({
    ua: app.userAgentFallback,
    name: app.getName(),
  }))

  expect(ua).not.toMatch(/Electron/i)

  // The name is ASKED OF THE RUNNING APPLICATION, not written here. This assertion used to
  // read `not.toMatch(/msg-hub/i)`, which is green whatever the application is called — so
  // on the day it was renamed it would have gone on passing while the new name went out to
  // Meta's servers in the User-Agent of every request.
  expect(name).toBeTruthy()
  expect(ua.toLowerCase()).not.toContain(name.toLowerCase())

  expect(ua).toMatch(/Chrome\/\d+/)
})
