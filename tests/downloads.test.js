import { describe, test, expect } from 'vitest'
import path from 'node:path'
import { resolveDownloadDir, uniquePath, planSave } from '../src/main/downloads.js'

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

// What happens to a file the moment it starts arriving. It is a pure function for one reason:
// the DEFAULT branch opens a modal save dialog, and no end-to-end test can answer a modal — so
// every download test has to turn the question off, and the branch the operator actually meets
// was the one branch nothing ever exercised.
describe('planSave', () => {
  const where = 'D:\\Praca'
  const free = () => false

  test('asking hands the dialog a starting point instead of a path', () => {
    const plan = planSave({ ask: true, folder: where, filename: 'faktura.pdf', exists: free })

    expect(plan.mode).toBe('dialog')
    expect(plan.defaultPath).toBe(path.join(where, 'faktura.pdf'))
    expect(plan.savePath).toBeUndefined()
  })

  test('not asking picks the path itself', () => {
    const plan = planSave({ ask: false, folder: where, filename: 'faktura.pdf', exists: free })

    expect(plan.mode).toBe('path')
    expect(plan.savePath).toBe(path.join(where, 'faktura.pdf'))
  })

  test('not asking still refuses to land on a file that is already there', () => {
    const taken = (candidate) => candidate === path.join(where, 'faktura.pdf')
    const plan = planSave({ ask: false, folder: where, filename: 'faktura.pdf', exists: taken })

    expect(plan.savePath).toBe(path.join(where, 'faktura (2).pdf'))
  })

  // A damaged layout file must not turn into silent writing. Anything that is not an explicit
  // "no" leaves the operator in charge of where the file goes.
  test('a setting that is missing or damaged asks rather than writes', () => {
    for (const ask of [undefined, null, 'nonsense']) {
      expect(planSave({ ask, folder: where, filename: 'x.pdf', exists: free }).mode).toBe('dialog')
    }
  })
})
