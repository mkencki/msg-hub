import { readFile, writeFile, rename } from 'node:fs/promises'

export const SCHEMA_VERSION = 2

export const PLATFORMS = {
  whatsapp: { url: 'https://web.whatsapp.com/', defaultName: 'WhatsApp' },
  messenger: { url: 'https://www.messenger.com/', defaultName: 'Messenger' },
}

// Two accounts sharing a colour cancel out the only identity signal the rail gives.
// The form therefore suggests a colour nobody is using yet, rather than always the same one.
export const CHANNEL_PALETTE = [
  '#2f7d5b', // WhatsApp green
  '#6586ec', // Messenger blue
  '#c9a227', // amber
  '#c9722b', // copper
  '#8e6bd1', // violet
  '#3aa6a0', // teal
]

export function unusedColor(accounts = []) {
  const taken = new Set(accounts.map((a) => String(a?.color || '').toLowerCase()))
  return CHANNEL_PALETTE.find((color) => !taken.has(color)) ?? CHANNEL_PALETTE[accounts.length % CHANNEL_PALETTE.length]
}

export function makeAccountId(name, existingIds = []) {
  const stem = String(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0142/g, 'l')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
  const base = `acc-${stem || 'account'}`
  if (!existingIds.includes(base)) return base
  let n = 2
  while (existingIds.includes(`${base}-${n}`)) n += 1
  return `${base}-${n}`
}

// Schema version 1 wrote these keys in Polish, because the app began as a private tool.
// Files written that way are still on disk, so every read accepts both spellings and the
// English one wins. That also covers a half-converted file without sniffing versions.
// Ids are never touched: the session partition is named persist:<id>, so rewriting one
// would sign the account out and demand a fresh QR code.
function normalizeAccount(raw) {
  return {
    id: raw?.id,
    name: raw?.name ?? raw?.nazwa,
    platform: raw?.platform ?? raw?.platforma,
    url: raw?.url,
    color: raw?.color ?? raw?.kolor,
  }
}

// An error is returned as a CODE, not as a sentence. Only the renderer knows which
// language is active, so sentences built here would show up in Polish inside an English
// interface. The renderer turns the code into text with t().
export function validateAccount(account) {
  const errors = []
  if (!account || typeof account !== 'object') return [{ code: 'validationName', params: {} }]
  if (!account.id || !/^acc-[a-z0-9-]+$/.test(account.id)) errors.push({ code: 'validationId', params: {} })
  if (!account.name || !String(account.name).trim()) errors.push({ code: 'validationName', params: {} })
  if (!PLATFORMS[account.platform]) errors.push({ code: 'validationPlatform', params: { platform: account.platform } })
  if (!String(account.url || '').startsWith('https://')) errors.push({ code: 'validationUrl', params: {} })
  if (!/^#[0-9a-fA-F]{6}$/.test(account.color || '')) errors.push({ code: 'validationColor', params: {} })
  return errors
}

// Only what the operator sees changes: the name and the channel colour. The id stays put
// for the reason above — fixing a typo in a name must not sign the account out.
export function updateAccount(accounts, id, changes) {
  const index = accounts.findIndex((a) => a.id === id)
  if (index === -1) return { ok: false, errors: [{ code: 'validationNoSuchAccount', params: {} }] }

  const updated = {
    ...accounts[index],
    name: String(changes?.name ?? '').trim(),
    color: changes?.color ?? accounts[index].color,
  }
  const errors = validateAccount(updated)
  if (errors.length) return { ok: false, errors }

  const result = [...accounts]
  result[index] = updated
  return { ok: true, accounts: result }
}

// Order in the file is the order of the channels. Moving past either end is not an
// error — the button simply does nothing.
export function moveAccount(accounts, id, offset) {
  const index = accounts.findIndex((a) => a.id === id)
  if (index === -1) return [...accounts]

  const target = index + offset
  if (target < 0 || target >= accounts.length) return [...accounts]

  const result = [...accounts]
  const [account] = result.splice(index, 1)
  result.splice(target, 0, account)
  return result
}

export async function loadAccounts(filePath) {
  let raw
  try {
    raw = await readFile(filePath, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return { version: SCHEMA_VERSION, accounts: [] }
    throw error
  }
  try {
    const data = JSON.parse(raw)
    const list = Array.isArray(data.accounts) ? data.accounts : Array.isArray(data.konta) ? data.konta : []
    const accounts = list.map(normalizeAccount).filter((a) => validateAccount(a).length === 0)
    return { version: SCHEMA_VERSION, accounts }
  } catch {
    await rename(filePath, filePath + '.corrupt')
    return { version: SCHEMA_VERSION, accounts: [] }
  }
}

export async function saveAccounts(filePath, accounts) {
  const seen = new Set()
  for (const account of accounts) {
    const errors = validateAccount(account)
    if (errors.length) throw new Error(`invalid account ${account?.id}: ${errors.map((e) => e.code).join(', ')}`)
    if (seen.has(account.id)) throw new Error(`duplicate id: ${account.id}`)
    seen.add(account.id)
  }
  const content = JSON.stringify({ version: SCHEMA_VERSION, accounts }, null, 2)
  await writeFile(filePath + '.tmp', content, 'utf8')
  await rename(filePath + '.tmp', filePath)
}
