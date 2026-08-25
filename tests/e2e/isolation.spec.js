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
  dataDir = await mkdtemp(path.join(tmpdir(), 'msghub-isolation-'))
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

test('the User-Agent does not give Electron away', async () => {
  const ua = await electronApp.evaluate(async ({ app }) => app.userAgentFallback)

  expect(ua).not.toMatch(/Electron/i)
  expect(ua).not.toMatch(/msg-hub/i)
  expect(ua).toMatch(/Chrome\/\d+/)
})
