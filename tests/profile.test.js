import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { migrateProfile } from '../src/main/profile.js'

// Version 0.5.0 gave the application a productName, and Electron derives the profile
// directory from it. Everything written under %APPDATA%\msg-hub stayed there while the
// application began reading %APPDATA%\M-HUB — measured on a real machine on 2026-08-27,
// where three accounts and a macro sat on disk, complete, and invisible to the app that
// had written them. Nothing was lost; the app simply stopped looking where the data is.

let root, from, to

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'mhub-profile-'))
  from = path.join(root, 'msg-hub')
  to = path.join(root, 'M-HUB')
  await mkdir(from)
  await mkdir(to)
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const write = (dir, file, data) => writeFile(path.join(dir, file), JSON.stringify(data), 'utf8')
const read = async (dir, file) => JSON.parse(await readFile(path.join(dir, file), 'utf8'))

// The Polish keys are the version 1 on-disk format, the same ones tests/migration.test.js
// guards. A profile old enough to sit in the old directory is usually old enough to be
// written this way, so the fixture matches what such a machine really holds.
const oldAccounts = {
  wersja: 1,
  konta: [
    { id: 'acc-messenger', nazwa: 'Messenger', platforma: 'messenger', url: 'https://www.messenger.com/', kolor: '#6586ec' },
  ],
}

describe('a profile left behind by the 0.5.0 rename', () => {
  test('accounts, macros and attachments arrive in the new profile', async () => {
    await write(from, 'accounts.json', oldAccounts)
    await write(from, 'macros.json', { wersja: 1, makra: [{ id: 'mac-a', nazwa: 'A', tekst: '', zalaczniki: ['att/clip.mp4'], tagi: [] }] })
    await mkdir(path.join(from, 'att'))
    await writeFile(path.join(from, 'att', 'clip.mp4'), 'binary', 'utf8')

    await migrateProfile({ from, to })

    expect(await read(to, 'accounts.json')).toEqual(oldAccounts)
    expect((await read(to, 'macros.json')).makra).toHaveLength(1)
    expect(await readFile(path.join(to, 'att', 'clip.mp4'), 'utf8')).toBe('binary')
  })

  // The session partition is named persist:<id>. Leaving it behind would sign every
  // account out and demand a fresh QR code — the one thing an upgrade must never do.
  test('session partitions travel with the accounts, so nobody scans a QR code again', async () => {
    await write(from, 'accounts.json', oldAccounts)
    await mkdir(path.join(from, 'Partitions', 'acc-messenger'), { recursive: true })
    await writeFile(path.join(from, 'Partitions', 'acc-messenger', 'Cookies'), 'session', 'utf8')

    await migrateProfile({ from, to })

    expect(await readFile(path.join(to, 'Partitions', 'acc-messenger', 'Cookies'), 'utf8')).toBe('session')
  })

  // A stale copy left beside the live one is worse than untidy: it comes back to life
  // the moment the new file is lost. saveLayout removes the version 1 file for the
  // same reason.
  test('the old profile keeps no copy of what was moved', async () => {
    await write(from, 'accounts.json', oldAccounts)

    await migrateProfile({ from, to })

    expect(existsSync(path.join(from, 'accounts.json'))).toBe(false)
  })

  test('what was moved is reported, so the log says what happened', async () => {
    await write(from, 'accounts.json', oldAccounts)
    await write(from, 'macros.json', { wersja: 1, makra: [] })

    const { moved } = await migrateProfile({ from, to })

    expect(moved).toEqual(expect.arrayContaining(['accounts.json', 'macros.json']))
  })
})

describe('when there is nothing to migrate', () => {
  // Removing every account writes an empty list rather than deleting the file, so a
  // profile that has been used at all has accounts.json. Its presence is what keeps this
  // from running twice — and from resurrecting accounts somebody deliberately deleted.
  test('a profile that already has accounts is left untouched', async () => {
    await write(to, 'accounts.json', { version: 2, accounts: [] })
    await write(from, 'accounts.json', oldAccounts)

    const { moved } = await migrateProfile({ from, to })

    expect(moved).toEqual([])
    expect(await read(to, 'accounts.json')).toEqual({ version: 2, accounts: [] })
    expect(existsSync(path.join(from, 'accounts.json'))).toBe(true)
  })

  // Schema version 1 kept the layout under a Polish name, and main.js still reads it when
  // the English one is absent. A profile old enough to sit in the old directory is exactly
  // the profile likely to carry it, so leaving it behind would lose the chosen language.
  test('a version 1 layout file travels under its Polish name', async () => {
    await write(from, 'uklad.json', { szerokosc: 1280, jezyk: 'pl' })
    await write(from, 'accounts.json', oldAccounts)

    await migrateProfile({ from, to })

    expect(await read(to, 'uklad.json')).toEqual({ szerokosc: 1280, jezyk: 'pl' })
  })

  // The caller is main.js, which runs before anything has written to the new profile.
  // A rename into a directory that is not there yet fails with ENOENT, and an upgrade
  // must not turn on whether Electron happened to create the directory first.
  test('the new profile directory is created when it is not there yet', async () => {
    await rm(to, { recursive: true, force: true })
    await write(from, 'accounts.json', oldAccounts)

    await migrateProfile({ from, to })

    expect(await read(to, 'accounts.json')).toEqual(oldAccounts)
  })

  test('a missing old profile is not an error', async () => {
    await rm(from, { recursive: true, force: true })

    const { moved } = await migrateProfile({ from, to })

    expect(moved).toEqual([])
  })

  // Everything the new profile already holds was written by the running application and
  // is newer than the old copy by definition. The window position it starts with must
  // not jump back to where the window stood before the upgrade.
  test('a file the new profile already has is not overwritten', async () => {
    await write(to, 'layout.json', { width: 1296, height: 816 })
    await write(from, 'layout.json', { width: 1280, height: 752 })
    await write(from, 'accounts.json', oldAccounts)

    await migrateProfile({ from, to })

    expect(await read(to, 'layout.json')).toEqual({ width: 1296, height: 816 })
    expect(await read(to, 'accounts.json')).toEqual(oldAccounts)
  })
})
