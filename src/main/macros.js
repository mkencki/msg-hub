import { readFile, writeFile, rename, copyFile, stat, readdir, unlink, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

// Re-exported from here because this is where anything about the macro model is looked
// for. The definition lives in shared/ so the sandboxed renderer can use it too, and
// putting it in src/main would drag node:fs into that import graph.
export { parseTags, formatTags } from '../shared/tags.js'

export const SCHEMA_VERSION = 2

export function makeMacroId(name) {
  const stem = String(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0142/g, 'l')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return `mac-${stem || randomUUID().slice(0, 8)}`
}

// Schema version 1 wrote these keys in Polish. Files written that way still exist, and
// one of them may point at a multi-megabyte attachment, so every read accepts both
// spellings with the English one winning. See tests/migration.test.js.
function normalizeMacro(raw) {
  return {
    id: raw?.id,
    name: raw?.name ?? raw?.nazwa,
    text: raw?.text ?? raw?.tekst ?? '',
    tags: raw?.tags ?? raw?.tagi ?? [],
    attachments: raw?.attachments ?? raw?.zalaczniki ?? [],
  }
}

export async function loadMacros(filePath) {
  try {
    const data = JSON.parse(await readFile(filePath, 'utf8'))
    const list = Array.isArray(data.macros) ? data.macros : Array.isArray(data.makra) ? data.makra : []
    return { version: SCHEMA_VERSION, macros: list.map(normalizeMacro) }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      await rename(filePath, filePath + '.corrupt').catch(() => {})
    }
    return { version: SCHEMA_VERSION, macros: [] }
  }
}

export async function saveMacros(filePath, macros) {
  const content = JSON.stringify({ version: SCHEMA_VERSION, macros }, null, 2)
  await writeFile(filePath + '.tmp', content, 'utf8')
  await rename(filePath + '.tmp', filePath)
}

// Editing must leave a macro where it was. The naive "filter it out and append" moves
// the macro being corrected to the bottom of the list on every save.
export function upsert(macros, macro) {
  const index = macros.findIndex((m) => m.id === macro.id)
  if (index === -1) return [...macros, macro]
  const result = [...macros]
  result[index] = macro
  return result
}

export function search(macros, phrase) {
  const needle = String(phrase || '').trim().toLowerCase()
  if (!needle) return [...macros]
  return macros.filter((m) => {
    const haystack = [m.name, m.text, ...(m.tags ?? [])].join(' ').toLowerCase()
    return haystack.includes(needle)
  })
}

export const ATTACHMENT_LIMIT_BYTES = 100 * 1024 * 1024

export async function addAttachment(attDir, sourcePath) {
  const info = await stat(sourcePath)
  if (info.size > ATTACHMENT_LIMIT_BYTES) {
    // Thrown as a code with parameters, not a sentence: only the renderer knows
    // which language is on screen. See validateAccount() for the same rule.
    const error = new Error('attachment too large')
    error.code = 'attachmentTooLarge'
    error.params = {
      mb: (info.size / 1048576).toFixed(1),
      limitMb: (ATTACHMENT_LIMIT_BYTES / 1048576).toFixed(0),
    }
    throw error
  }
  await mkdir(attDir, { recursive: true })
  const name = `${randomUUID()}-${path.basename(sourcePath)}`
  await copyFile(sourcePath, path.join(attDir, name))
  return `att/${name}`
}

export async function removeOrphanAttachments(attDir, macros) {
  const used = new Set(macros.flatMap((m) => m.attachments ?? []).map((p) => path.basename(p)))
  const removed = []
  // The store is created with the first attachment — its absence simply means
  // there is nothing to clean up.
  const entries = await readdir(attDir).catch((error) => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  for (const name of entries) {
    if (!used.has(name)) {
      await unlink(path.join(attDir, name))
      removed.push(name)
    }
  }
  return removed
}

export async function storageUsage(attDir) {
  let total = 0
  for (const name of await readdir(attDir)) {
    total += (await stat(path.join(attDir, name))).size
  }
  return total
}
