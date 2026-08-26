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
  parseTags,
  formatTags,
} from '../src/main/macros.js'

let file, dir

const macro = (overrides = {}) => ({
  id: 'mac-test',
  name: 'Client Zone manual',
  text: '*How to add a driver:*\n1. Sign in',
  attachments: [],
  tags: ['zone'],
  ...overrides,
})

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'mhub-macros-'))
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
    expect(result.macros[0].text).toBe('*How to add a driver:*\n1. Sign in')
  })
})

describe('search', () => {
  const corpus = [
    macro({ id: 'mac-a', name: 'Client Zone', text: 'sign-in', tags: ['zone'] }),
    macro({ id: 'mac-b', name: 'Passango', text: 'device installation', tags: ['passango'] }),
  ]

  test('finds by name regardless of case', () => {
    expect(search(corpus, 'zone').map((m) => m.id)).toEqual(['mac-a'])
  })

  test('finds by content', () => {
    expect(search(corpus, 'installation').map((m) => m.id)).toEqual(['mac-b'])
  })

  test('finds by tag', () => {
    expect(search(corpus, 'passango').map((m) => m.id)).toEqual(['mac-b'])
  })

  test('an empty phrase returns everything', () => {
    expect(search(corpus, '   ')).toHaveLength(2)
  })
})

describe('makeMacroId', () => {
  test('builds an id out of safe characters', () => {
    expect(makeMacroId('Manual — Client Zone!')).toMatch(/^mac-[a-z0-9-]+$/)
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
    const source = await tempFile(dir, 'manual.pdf', 'pretend pdf')

    const relative = await addAttachment(att, source)

    expect(relative).toMatch(/^att\/[0-9a-f-]+-manual\.pdf$/)
    expect(await readdir(att)).toHaveLength(1)
  })

  test('a file over the limit is refused, with its size reported', async () => {
    const att = path.join(dir, 'att')
    await mkdir(att, { recursive: true })
    const source = path.join(dir, 'huge.mp4')
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
    const used = await addAttachment(att, await tempFile(dir, 'used.pdf'))
    await addAttachment(att, await tempFile(dir, 'orphan.pdf'))

    const removed = await removeOrphanAttachments(att, [macro({ attachments: [used] })])

    expect(removed).toHaveLength(1)
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
  const list = [
    macro({ id: 'mac-a', name: 'Alfa' }),
    macro({ id: 'mac-b', name: 'Beta' }),
    macro({ id: 'mac-c', name: 'Gamma' }),
  ]

  test('updating an existing macro leaves it in the same position', () => {
    const result = upsert(list, macro({ id: 'mac-b', name: 'Beta corrected' }))

    expect(result.map((m) => m.id)).toEqual(['mac-a', 'mac-b', 'mac-c'])
    expect(result[1].name).toBe('Beta corrected')
  })

  test('a new macro lands at the end of the list', () => {
    const result = upsert(list, macro({ id: 'mac-d', name: 'Delta' }))

    expect(result.map((m) => m.id)).toEqual(['mac-a', 'mac-b', 'mac-c', 'mac-d'])
  })

  test('the source list stays untouched', () => {
    upsert(list, macro({ id: 'mac-b', name: 'Beta corrected' }))

    expect(list[1].name).toBe('Beta')
  })
})

describe('cleaning a store that does not exist', () => {
  test('a missing att directory is not an error, there is nothing to clean', async () => {
    const missingDir = path.join(dir, 'att-that-does-not-exist')

    expect(await removeOrphanAttachments(missingDir, [])).toEqual([])
  })
})

describe('tags as the operator types them', () => {
  test('a comma-separated line becomes a list', () => {
    expect(parseTags('offer, client zone, pdf')).toEqual(['offer', 'client zone', 'pdf'])
  })

  // Search lowercases what it looks for, so a tag stored with a capital would be findable
  // by "Zone" and invisible to "zone" — which is what anyone would actually type.
  test('case is settled on the way in, because search settles it on the way out', () => {
    expect(parseTags('Offer, ZONE')).toEqual(['offer', 'zone'])
  })

  test('empty pieces and stray spaces are dropped rather than stored', () => {
    expect(parseTags('  offer ,, ,  pdf  ')).toEqual(['offer', 'pdf'])
  })

  test('the same tag twice is the same tag once', () => {
    expect(parseTags('offer, Offer,  offer ')).toEqual(['offer'])
  })

  test('nothing typed is no tags, not a list with a blank in it', () => {
    expect(parseTags('')).toEqual([])
    expect(parseTags('   ')).toEqual([])
    expect(parseTags(undefined)).toEqual([])
  })

  test('what was stored comes back the way it was typed, ready to edit', () => {
    expect(formatTags(['offer', 'client zone'])).toBe('offer, client zone')
    expect(formatTags([])).toBe('')
    expect(formatTags(undefined)).toBe('')
  })
})
