import { describe, test, expect } from 'vitest'
import path from 'node:path'
import { resolveDownloadDir, uniquePath } from '../src/main/downloads.js'

describe('resolveDownloadDir', () => {
  // An unset folder is resolved when a download starts, not written into the layout file: a
  // layout copied to another machine must not carry a path that exists nowhere.
  test('an unset folder means the system Downloads folder', () => {
    expect(resolveDownloadDir('', 'C:\\Users\\marek\\Downloads')).toBe('C:\\Users\\marek\\Downloads')
    expect(resolveDownloadDir(undefined, 'C:\\Users\\marek\\Downloads')).toBe('C:\\Users\\marek\\Downloads')
    expect(resolveDownloadDir(null, 'C:\\Users\\marek\\Downloads')).toBe('C:\\Users\\marek\\Downloads')
  })

  test('a folder of nothing but spaces is not a folder', () => {
    expect(resolveDownloadDir('   ', 'C:\\Users\\marek\\Downloads')).toBe('C:\\Users\\marek\\Downloads')
  })

  test('a chosen folder is used as it stands', () => {
    expect(resolveDownloadDir('D:\\Praca', 'C:\\Users\\marek\\Downloads')).toBe('D:\\Praca')
  })
})

describe('uniquePath', () => {
  const where = 'D:\\Praca'
  const taken = (...names) => {
    const set = new Set(names.map((name) => path.join(where, name)))
    return (candidate) => set.has(candidate)
  }

  test('a free name is used unchanged', () => {
    expect(uniquePath(where, 'faktura.pdf', taken())).toBe(path.join(where, 'faktura.pdf'))
  })

  // Chromium adds its own "(1)" only while it is choosing the path itself. The moment
  // setSavePath is called the path is taken literally — and the same attachment downloaded
  // twice would overwrite the first copy without a word.
  test('a taken name gets a number instead of the previous file', () => {
    expect(uniquePath(where, 'faktura.pdf', taken('faktura.pdf'))).toBe(path.join(where, 'faktura (2).pdf'))
  })

  test('numbering keeps going while names are taken', () => {
    expect(uniquePath(where, 'faktura.pdf', taken('faktura.pdf', 'faktura (2).pdf'))).toBe(
      path.join(where, 'faktura (3).pdf'),
    )
  })

  test('a name with no extension is still numbered', () => {
    expect(uniquePath(where, 'notatka', taken('notatka'))).toBe(path.join(where, 'notatka (2)'))
  })

  // ".tar.gz" is one extension to a person and two to path.extname. Numbering the part before
  // the LAST dot keeps the file openable, which is what matters more than tidiness.
  test('a double extension keeps its tail', () => {
    expect(uniquePath(where, 'kopia.tar.gz', taken('kopia.tar.gz'))).toBe(path.join(where, 'kopia.tar (2).gz'))
  })

  test('a dotfile is not mistaken for an extension', () => {
    expect(uniquePath(where, '.gitignore', taken('.gitignore'))).toBe(path.join(where, '.gitignore (2)'))
  })
})
