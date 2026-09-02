import { describe, test, expect } from 'vitest'
import { pasteAttachments } from '../src/main/bridge.js'

// THE DOUBLED BACKSLASHES ARE THE POINT – see the same warning in file-clipboard.test.js.
// Written with one, 'C:\data\att\a.pdf' parses to C:dataatta.pdf and the test exercises a
// string that is not a path. This file was written that way first and the assertion caught
// it, which is the only reason the note is here twice.
const DATA_DIR = 'C:\\data'

const view = () => {
  const pastes = []
  return { pastes, webContents: { paste: () => pastes.push(1) } }
}

const reachAll = async () => {}

describe('pasteAttachments', () => {
  test('every attachment that is there goes in', async () => {
    const target = view()
    const put = []

    const { missing } = await pasteAttachments({
      attachments: ['att/a.pdf', 'att/b.pdf'],
      dataDir: DATA_DIR,
      clipboardSession: { setFile: async (full) => put.push(full) },
      view: target,
      reach: reachAll,
    })

    expect(missing).toEqual([])
    expect(put).toEqual(['C:\\data\\att\\a.pdf', 'C:\\data\\att\\b.pdf'])
    expect(target.pastes).toHaveLength(2)
  })

  test('a file gone from the store is named rather than pasted', async () => {
    const target = view()

    const { missing } = await pasteAttachments({
      attachments: ['att/gone.pdf'],
      dataDir: DATA_DIR,
      clipboardSession: { setFile: async () => {} },
      view: target,
      reach: async () => {
        throw new Error('ENOENT')
      },
    })

    expect(missing).toEqual(['att/gone.pdf'])
    expect(target.pastes).toHaveLength(0)
  })

  // The clipboard refusing is the same kind of failure as the file being gone, and used to
  // be neither caught nor reported: the rejection escaped the IPC handler, the operator was
  // told nothing at all, and every attachment after the failed one was silently skipped.
  test('a clipboard that refuses is reported, and the rest still go in', async () => {
    const target = view()

    const { missing } = await pasteAttachments({
      attachments: ['att/bad.pdf', 'att/good.pdf'],
      dataDir: DATA_DIR,
      clipboardSession: {
        setFile: async (full) => {
          if (full.includes('bad')) throw new Error('PowerShell did not answer within the expected time')
        },
      },
      view: target,
      reach: reachAll,
    })

    expect(missing).toEqual(['att/bad.pdf'])
    expect(target.pastes).toHaveLength(1)
  })

  test('nothing is pasted for a file the clipboard would not take', async () => {
    const target = view()

    await pasteAttachments({
      attachments: ['att/bad.pdf'],
      dataDir: DATA_DIR,
      clipboardSession: {
        setFile: async () => {
          throw new Error('nope')
        },
      },
      view: target,
      reach: reachAll,
    })

    expect(target.pastes).toHaveLength(0)
  })
})
