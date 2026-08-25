import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  loadAccounts,
  saveAccounts,
  validateAccount,
  makeAccountId,
  updateAccount,
  moveAccount,
  unusedColor,
  CHANNEL_PALETTE,
  SCHEMA_VERSION,
} from '../src/main/accounts.js'

let dir
let file

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'msghub-'))
  file = path.join(dir, 'accounts.json')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('loadAccounts', () => {
  test('a missing file yields an empty list, not an error', async () => {
    const result = await loadAccounts(file)
    expect(result.accounts).toEqual([])
    expect(result.version).toBe(SCHEMA_VERSION)
  })

  test('reads back saved accounts', async () => {
    const accounts = [
      { id: 'acc-a', name: 'A', platform: 'whatsapp', url: 'https://web.whatsapp.com/', color: '#2f7d5b' },
    ]
    await saveAccounts(file, accounts)
    const result = await loadAccounts(file)
    expect(result.accounts).toHaveLength(1)
    expect(result.accounts[0].id).toBe('acc-a')
  })

  test('a damaged file is set aside as a copy and the app starts empty', async () => {
    await writeFile(file, '{to nie jest json', 'utf8')
    const result = await loadAccounts(file)
    expect(result.accounts).toEqual([])
    const kopia = await readFile(file + '.corrupt', 'utf8')
    expect(kopia).toContain('to nie jest json')
  })
})

describe('validateAccount', () => {
  const valid = {
    id: 'acc-a',
    name: 'A',
    platform: 'whatsapp',
    url: 'https://web.whatsapp.com/',
    color: '#2f7d5b',
  }

  test('a valid account has no errors', () => {
    expect(validateAccount(valid)).toEqual([])
  })

  test('an empty name is an error', () => {
    expect(validateAccount({ ...valid, name: '  ' }).map((error) => error.code)).toContain('validationName')
  })

  test('an unknown platform is an error', () => {
    expect(validateAccount({ ...valid, platform: 'signal' })).toContainEqual({
      code: 'validationPlatform',
      params: { platform: 'signal' },
    })
  })

  test('an address that is not https is an error', () => {
    expect(validateAccount({ ...valid, url: 'http://web.whatsapp.com/' }).map((error) => error.code)).toContain(
      'validationUrl',
    )
  })
})

describe('makeAccountId', () => {
  test('builds an id out of safe characters', () => {
    expect(makeAccountId('WhatsApp work', [])).toMatch(/^acc-[a-z0-9-]+$/)
  })

  test('avoids colliding with an existing id', () => {
    const first = makeAccountId('WhatsApp', [])
    const second = makeAccountId('WhatsApp', [first])
    expect(second).not.toBe(first)
  })

  test('Polish characters are transliterated, not stripped to nothing', () => {
    expect(makeAccountId('Służbowy', [])).toBe('acc-sluzbowy')
  })
})

describe('saveAccounts', () => {
  test('refuses to save on a duplicate id', async () => {
    const accounts = [
      { id: 'acc-a', name: 'A', platform: 'whatsapp', url: 'https://web.whatsapp.com/', color: '#2f7d5b' },
      { id: 'acc-a', name: 'B', platform: 'whatsapp', url: 'https://web.whatsapp.com/', color: '#2f7d5b' },
    ]
    await expect(saveAccounts(file, accounts)).rejects.toThrow(/duplicate id/)
  })
})

const trzyKonta = () => [
  { id: 'acc-messenger', name: 'Messenger', platform: 'messenger', url: 'https://www.messenger.com/', color: '#6586ec' },
  { id: 'acc-whatsapp-priv', name: 'WhatsApp_PRIV', platform: 'whatsapp', url: 'https://web.whatsapp.com/', color: '#2f7d5b' },
  { id: 'acc-whatsapp-work', name: 'WhatsApp_WORK', platform: 'whatsapp', url: 'https://web.whatsapp.com/', color: '#2f7d5b' },
]

describe('updateAccount', () => {
  test('a rename does NOT touch the id, because the session partition rests on it', () => {
    const result = updateAccount(trzyKonta(), 'acc-whatsapp-priv', { name: 'WhatsApp Dom', color: '#2f7d5b' })

    expect(result.ok).toBe(true)
    expect(result.accounts[1].id).toBe('acc-whatsapp-priv')
    expect(result.accounts[1].name).toBe('WhatsApp Dom')
  })

  test('an update leaves the account in the same position', () => {
    const result = updateAccount(trzyKonta(), 'acc-messenger', { name: 'Messenger firmowy', color: '#6586ec' })

    expect(result.accounts.map((k) => k.id)).toEqual(['acc-messenger', 'acc-whatsapp-priv', 'acc-whatsapp-work'])
  })

  test('platform and address survive a rename', () => {
    const result = updateAccount(trzyKonta(), 'acc-whatsapp-work', { name: 'Praca', color: '#123456' })

    expect(result.accounts[2].platform).toBe('whatsapp')
    expect(result.accounts[2].url).toBe('https://web.whatsapp.com/')
    expect(result.accounts[2].color).toBe('#123456')
  })

  test('an empty name is refused and the list stays untouched', () => {
    const accounts = trzyKonta()
    const result = updateAccount(accounts, 'acc-messenger', { name: '   ', color: '#6586ec' })

    expect(result.ok).toBe(false)
    expect(result.errors.map((error) => error.code)).toContain('validationName')
    expect(accounts[0].name).toBe('Messenger')
  })

  // The renderer picks the interface language, so the main process must not return
  // finished sentences: Polish ones would leak into an English interface. It hands back
  // a code and parameters, and t() assembles the text.
  test('validation errors come back as codes with parameters, not finished sentences', () => {
    const errors = validateAccount({ id: 'acc-x', name: '', platform: 'unknown', url: 'http://x', color: 'green' })

    expect(errors.map((error) => error.code)).toEqual([
      'validationName',
      'validationPlatform',
      'validationUrl',
      'validationColor',
    ])
    expect(errors.find((error) => error.code === 'validationPlatform').params).toEqual({ platform: 'unknown' })
  })

  test('an unknown id yields an error, not an exception', () => {
    expect(updateAccount(trzyKonta(), 'acc-nie-ma', { name: 'X', color: '#000000' }).ok).toBe(false)
  })
})

describe('moveAccount', () => {
  test('moving up swaps the account with the previous one', () => {
    const result = moveAccount(trzyKonta(), 'acc-whatsapp-priv', -1)

    expect(result.map((k) => k.id)).toEqual(['acc-whatsapp-priv', 'acc-messenger', 'acc-whatsapp-work'])
  })

  test('moving down swaps the account with the next one', () => {
    const result = moveAccount(trzyKonta(), 'acc-messenger', 1)

    expect(result.map((k) => k.id)).toEqual(['acc-whatsapp-priv', 'acc-messenger', 'acc-whatsapp-work'])
  })

  test('the first account cannot be moved further up', () => {
    const result = moveAccount(trzyKonta(), 'acc-messenger', -1)

    expect(result.map((k) => k.id)).toEqual(['acc-messenger', 'acc-whatsapp-priv', 'acc-whatsapp-work'])
  })

  test('the last account cannot be moved further down', () => {
    const result = moveAccount(trzyKonta(), 'acc-whatsapp-work', 1)

    expect(result.map((k) => k.id)).toEqual(['acc-messenger', 'acc-whatsapp-priv', 'acc-whatsapp-work'])
  })

  test('the source list stays untouched', () => {
    const accounts = trzyKonta()
    moveAccount(accounts, 'acc-messenger', 1)

    expect(accounts.map((k) => k.id)).toEqual(['acc-messenger', 'acc-whatsapp-priv', 'acc-whatsapp-work'])
  })
})

describe('unusedColor', () => {
  test('the first account gets the first colour of the palette', () => {
    expect(unusedColor([])).toBe(CHANNEL_PALETTE[0])
  })

  test('a second account does NOT get the colour of the first, which is what channel identity rests on', () => {
    const zajety = [{ color: CHANNEL_PALETTE[0] }]

    expect(unusedColor(zajety)).not.toBe(CHANNEL_PALETTE[0])
    expect(CHANNEL_PALETTE).toContain(unusedColor(zajety))
  })

  test('the comparison ignores the case of the colour', () => {
    expect(unusedColor([{ color: CHANNEL_PALETTE[0].toUpperCase() }])).not.toBe(CHANNEL_PALETTE[0])
  })

  test('with the whole palette taken it wraps to the first rather than returning nothing', () => {
    const all = CHANNEL_PALETTE.map((color) => ({ color }))

    expect(CHANNEL_PALETTE).toContain(unusedColor(all))
  })
})
