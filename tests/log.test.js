import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createLogger, LOGGED_FIELDS } from '../src/main/log.js'

let dir

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'msghub-log-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
})

const readLog = async (name = 'm-hub.log') => readFile(path.join(dir, name), 'utf8')

describe('the local log', () => {
  test('an event is one line, with the fields it was given', async () => {
    const log = createLogger(dir)

    await log.write('account-load-failed', { account: 'acc-work', code: -105 })

    const line = (await readLog()).trim()
    expect(line).toContain('account-load-failed')
    expect(line).toContain('account=acc-work')
    expect(line).toContain('code=-105')
  })

  test('every line is stamped, so two reports can be compared', async () => {
    const log = createLogger(dir)

    await log.write('started', {})

    expect(await readLog()).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z /)
  })

  // The rule this file exists to keep. A log the operator can send to someone else is the
  // opposite of telemetry only for as long as it cannot carry what was said or to whom.
  // Page titles are where the unread counts come from and they carry contact names; macro
  // text is the message itself; attachment names are often a client's name and a date.
  test('a field the logger does not know is not written at all', async () => {
    const log = createLogger(dir)

    await log.write('macro-inserted', {
      account: 'acc-work',
      text: 'Good morning Mr Kowalski, about your order',
      attachment: 'offer-Kowalski-2026.pdf',
      title: '(3) Anna Nowak',
    })

    const line = await readLog()
    expect(line).toContain('account=acc-work')
    expect(line).not.toContain('Kowalski')
    expect(line).not.toContain('Anna')
    expect(line).not.toContain('offer')
    expect(line).not.toContain('text=')
    expect(line).not.toContain('title=')
  })

  test('the known fields are a short, deliberate list', () => {
    expect(LOGGED_FIELDS).toEqual(['account', 'platform', 'code', 'reason', 'count', 'ms'])
  })

  // One event, one line. A value carrying a newline would otherwise split into two entries
  // and the second would look like an event of its own.
  test('a value cannot break out into a line of its own', async () => {
    const log = createLogger(dir)

    await log.write('account-load-failed', { reason: 'first\nsecond\rthird' })

    expect((await readLog()).trimEnd().split('\n')).toHaveLength(1)
  })

  test('a very long value is cut rather than allowed to fill the file', async () => {
    const log = createLogger(dir)

    await log.write('account-load-failed', { reason: 'x'.repeat(500) })

    expect((await readLog()).length).toBeLessThan(300)
  })

  // A log that grows forever is a log that fills a disk. Two files is a hard ceiling, not a
  // policy: the older one is replaced rather than kept alongside.
  test('the file is rotated once it passes its size, and only one older file is kept', async () => {
    const log = createLogger(dir, { maxBytes: 200 })

    for (let n = 0; n < 40; n += 1) await log.write('account-load-failed', { code: n })

    const files = (await readdir(dir)).sort()
    expect(files).toEqual(['m-hub.1.log', 'm-hub.log'])
    expect((await readLog()).length).toBeLessThanOrEqual(200 + 100)
  })

  test('rotating replaces the older file instead of piling them up', async () => {
    await writeFile(path.join(dir, 'm-hub.1.log'), 'ancient', 'utf8')
    const log = createLogger(dir, { maxBytes: 100 })

    for (let n = 0; n < 20; n += 1) await log.write('started', { count: n })

    expect(await readLog('m-hub.1.log')).not.toContain('ancient')
  })

  // A log that cannot be written must never be the reason the application stops working.
  test('a directory that cannot be written to is not fatal', async () => {
    const log = createLogger(path.join(dir, 'missing', 'deeper'), { create: false })

    await expect(log.write('started', {})).resolves.toBeUndefined()
  })
})
