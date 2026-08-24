import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile as writeTestFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  loadMacros,
  saveMacros,
  search,
  makeMacroId,
  addAttachment,
  removeOrphanAttachments,
  storageUsage,
  upsert,
  ATTACHMENT_LIMIT_BYTES,
} from '../src/main/macros.js'

let file, dir

const macro = (nadpisania = {}) => ({
  id: 'mac-test',
  name: 'Instrukcja Strefa Klienta',
  text: '*Jak dodac kierowce:*\n1. Zaloguj sie',
  attachments: [],
  tags: ['strefa'],
  ...nadpisania,
})

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'msghub-macros-'))
  file = path.join(dir, 'macros.json')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('the macro store', () => {
  test('a missing file yields an empty list', async () => {
    expect((await loadMacros(file)).macros).toEqual([])
  })

  test('a macro survives a save and a read, formatting included', async () => {
    await saveMacros(file, [macro()])
    const result = await loadMacros(file)
    expect(result.macros[0].text).toBe('*Jak dodac kierowce:*\n1. Zaloguj sie')
  })
})

describe('search', () => {
  const zbior = [
    macro({ id: 'mac-a', name: 'Strefa Klienta', text: 'logowanie', tags: ['strefa'] }),
    macro({ id: 'mac-b', name: 'Passango', text: 'instalacja urzadzenia', tags: ['passango'] }),
  ]

  test('finds by name regardless of case', () => {
    expect(search(zbior, 'strefa').map((m) => m.id)).toEqual(['mac-a'])
  })

  test('finds by content', () => {
    expect(search(zbior, 'instalacja').map((m) => m.id)).toEqual(['mac-b'])
  })

  test('finds by tag', () => {
    expect(search(zbior, 'passango').map((m) => m.id)).toEqual(['mac-b'])
  })

  test('an empty phrase returns everything', () => {
    expect(search(zbior, '   ')).toHaveLength(2)
  })
})

describe('makeMacroId', () => {
  test('builds an id out of safe characters', () => {
    expect(makeMacroId('Instrukcja — Strefa Klienta!')).toMatch(/^mac-[a-z0-9-]+$/)
  })

  test('Polish characters are transliterated', () => {
    expect(makeMacroId('Załączniki')).toBe('mac-zalaczniki')
  })
})

async function tempFile(baseDir, name, content = 'x') {
  const filePath = path.join(baseDir, name)
  await writeTestFile(filePath, content, 'utf8')
  return filePath
}

describe('attachments', () => {
  test('adding copies the file into the store and returns a relative path', async () => {
    const att = path.join(dir, 'att')
    await mkdir(att, { recursive: true })
    const source = await tempFile(dir, 'instrukcja.pdf', 'udawany pdf')

    const relative = await addAttachment(att, source)

    expect(relative).toMatch(/^att\/[0-9a-f-]+-instrukcja\.pdf$/)
    expect(await readdir(att)).toHaveLength(1)
  })

  test('a file over the limit is refused, with its size reported', async () => {
    const att = path.join(dir, 'att')
    await mkdir(att, { recursive: true })
    const source = path.join(dir, 'wielki.mp4')
    await writeTestFile(source, Buffer.alloc(ATTACHMENT_LIMIT_BYTES + 1))

    // The limit is reported as a code with parameters, not as a sentence — only the
    // renderer knows which language the message has to appear in.
    await expect(addAttachment(att, source)).rejects.toMatchObject({
      code: 'attachmentTooLarge',
      params: { limitMb: '100' },
    })
    expect(await readdir(att)).toHaveLength(0)
  })

  test('orphaned copies are deleted, linked ones stay', async () => {
    const att = path.join(dir, 'att')
    await mkdir(att, { recursive: true })
    const uzywany = await addAttachment(att, await tempFile(dir, 'uzywany.pdf'))
    await addAttachment(att, await tempFile(dir, 'sierota.pdf'))

    const usuniete = await removeOrphanAttachments(att, [macro({ attachments: [uzywany] })])

    expect(usuniete).toHaveLength(1)
    expect(await readdir(att)).toHaveLength(1)
  })

  test('store usage sums the bytes', async () => {
    const att = path.join(dir, 'att')
    await mkdir(att, { recursive: true })
    await addAttachment(att, await tempFile(dir, 'a.pdf', 'xxxxx'))

    expect(await storageUsage(att)).toBe(5)
  })
})

describe('editing macros', () => {
  const lista = [
    macro({ id: 'mac-a', name: 'Alfa' }),
    macro({ id: 'mac-b', name: 'Beta' }),
    macro({ id: 'mac-c', name: 'Gamma' }),
  ]

  test('updating an existing macro leaves it in the same position', () => {
    const result = upsert(lista, macro({ id: 'mac-b', name: 'Beta poprawiona' }))

    expect(result.map((m) => m.id)).toEqual(['mac-a', 'mac-b', 'mac-c'])
    expect(result[1].name).toBe('Beta poprawiona')
  })

  test('a new macro lands at the end of the list', () => {
    const result = upsert(lista, macro({ id: 'mac-d', name: 'Delta' }))

    expect(result.map((m) => m.id)).toEqual(['mac-a', 'mac-b', 'mac-c', 'mac-d'])
  })

  test('the source list stays untouched', () => {
    upsert(lista, macro({ id: 'mac-b', name: 'Beta poprawiona' }))

    expect(lista[1].name).toBe('Beta')
  })
})

describe('cleaning a store that does not exist', () => {
  test('a missing att directory is not an error, there is nothing to clean', async () => {
    const nieistniejacy = path.join(dir, 'att-ktorego-nie-ma')

    expect(await removeOrphanAttachments(nieistniejacy, [])).toEqual([])
  })
})
