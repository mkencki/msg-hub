import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { loadAccounts, saveAccounts, SCHEMA_VERSION } from '../src/main/accounts.js'
import { loadMacros } from '../src/main/macros.js'
import { loadLayout } from '../src/main/shell.js'

// Schema version 1 wrote its keys in Polish, because the app began as a private tool.
// Files written that way exist on real disks, so renaming the code to English must not
// cost anyone their accounts, their macros, or the attachments those macros point at.
//
// THE POLISH KEYS BELOW ARE THE POINT OF THIS FILE. Do not "tidy" them into English –
// they are the old on-disk format, not a naming slip.

let dir

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'mhub-migration-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const write = (file, data) => writeFile(path.join(dir, file), JSON.stringify(data, null, 2), 'utf8')

describe('upgrading from schema version 1', () => {
  test('accounts keep their name, platform and colour', async () => {
    await write('accounts.json', {
      wersja: 1,
      konta: [
        {
          id: 'acc-whatsapp-priv',
          nazwa: 'WhatsApp_PRIV',
          platforma: 'whatsapp',
          url: 'https://web.whatsapp.com/',
          kolor: '#2f7d5b',
        },
      ],
    })

    const { version, accounts } = await loadAccounts(path.join(dir, 'accounts.json'))

    expect(version).toBe(SCHEMA_VERSION)
    expect(accounts).toEqual([
      {
        id: 'acc-whatsapp-priv',
        name: 'WhatsApp_PRIV',
        platform: 'whatsapp',
        url: 'https://web.whatsapp.com/',
        color: '#2f7d5b',
      },
    ])
  })

  // The session partition is named persist:<id>. Rewriting an id would sign the account
  // out and demand a fresh QR code – the one thing an upgrade must never do.
  test('account ids survive untouched, so nobody is signed out', async () => {
    await write('accounts.json', {
      wersja: 1,
      konta: [
        {
          id: 'acc-messenger',
          nazwa: 'Messenger',
          platforma: 'messenger',
          url: 'https://www.messenger.com/',
          kolor: '#6586ec',
        },
      ],
    })

    const { accounts } = await loadAccounts(path.join(dir, 'accounts.json'))

    expect(accounts[0].id).toBe('acc-messenger')
  })

  test('macros keep their text, tags and attachment paths', async () => {
    await write('macros.json', {
      wersja: 1,
      makra: [
        {
          id: 'mac-passango',
          nazwa: 'PASSango - instrukcja',
          tekst: '*Jak wylaczyc*',
          tagi: ['passango'],
          zalaczniki: ['att/d35da533-3b22-444f-92a7-b2b10adf0d8f-PASSango.mp4'],
        },
      ],
    })

    const { version, macros } = await loadMacros(path.join(dir, 'macros.json'))

    expect(version).toBe(SCHEMA_VERSION)
    expect(macros).toEqual([
      {
        id: 'mac-passango',
        name: 'PASSango - instrukcja',
        text: '*Jak wylaczyc*',
        tags: ['passango'],
        attachments: ['att/d35da533-3b22-444f-92a7-b2b10adf0d8f-PASSango.mp4'],
      },
    ])
  })

  test('layout keeps window geometry, pinned rail and chosen language', async () => {
    await write('layout.json', {
      x: 320,
      y: 116,
      szerokosc: 1280,
      wysokosc: 752,
      zmaksymalizowane: true,
      szynaPrzypieta: true,
      jezyk: 'pl',
    })

    const layout = await loadLayout(path.join(dir, 'layout.json'))

    expect(layout).toMatchObject({
      x: 320,
      y: 116,
      width: 1280,
      height: 752,
      maximized: true,
      railPinned: true,
      language: 'pl',
    })
  })

  // A half-converted file – one the app wrote mid-upgrade, or a hand edit – must not
  // silently drop the half it does understand.
  test('a file mixing both key sets keeps whatever it can', async () => {
    await write('accounts.json', {
      version: 2,
      accounts: [
        {
          id: 'acc-a',
          nazwa: 'Stara nazwa',
          platform: 'whatsapp',
          url: 'https://web.whatsapp.com/',
          kolor: '#2f7d5b',
        },
      ],
    })

    const { accounts } = await loadAccounts(path.join(dir, 'accounts.json'))

    expect(accounts[0]).toMatchObject({
      id: 'acc-a',
      name: 'Stara nazwa',
      platform: 'whatsapp',
      color: '#2f7d5b',
    })
  })

  test('the next save writes version 2 with English keys', async () => {
    const file = path.join(dir, 'accounts.json')
    await write('accounts.json', {
      wersja: 1,
      konta: [
        { id: 'acc-a', nazwa: 'A', platforma: 'whatsapp', url: 'https://web.whatsapp.com/', kolor: '#2f7d5b' },
      ],
    })

    const { accounts } = await loadAccounts(file)
    await saveAccounts(file, accounts)

    const onDisk = JSON.parse(await readFile(file, 'utf8'))
    expect(onDisk.version).toBe(2)
    expect(onDisk.accounts[0]).toEqual({
      id: 'acc-a',
      name: 'A',
      platform: 'whatsapp',
      url: 'https://web.whatsapp.com/',
      color: '#2f7d5b',
    })
    expect(onDisk).not.toHaveProperty('wersja')
    expect(onDisk).not.toHaveProperty('konta')
  })
})
