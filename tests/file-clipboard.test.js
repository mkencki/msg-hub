import { describe, test, expect } from 'vitest'
import { PassThrough } from 'node:stream'
import {
  quotePS,
  buildCommand,
  setClipboardFile,
  createClipboardSession,
  DONE_MARKER,
} from '../src/main/file-clipboard.js'

// THE DOUBLED BACKSLASHES BELOW ARE THE POINT. Do not "tidy" them down to one.
// Until 2026-08-25 these literals were written with a single backslash, and JavaScript
// silently dropped it: 'C:\files\a.pdf' parses to C:filesa.pdf, because \f and \a are not
// escapes that survive. Every assertion still passed, because both sides of the comparison
// were mangled the same way — so the suite claimed to exercise Windows paths while
// exercising strings that were not paths at all.
const FILE = 'C:\\files\\a.pdf'
const WITH_APOSTROPHE = "C:\\files\\o'brien.pdf"
// Square brackets are a wildcard to PowerShell's -Path. This is the case -LiteralPath exists for.
const WITH_BRACKETS = 'C:\\files\\handbook [PL].pdf'

describe('quotePS', () => {
  test('wraps the path in single quotes', () => {
    expect(quotePS(FILE)).toBe("'C:\\files\\a.pdf'")
  })

  test('doubles single quotes, which is the guard against injection', () => {
    expect(quotePS(WITH_APOSTROPHE)).toBe("'C:\\files\\o''brien.pdf'")
  })

  test('a backslash survives quoting untouched — a Windows path is not an escape sequence', () => {
    expect(quotePS(FILE)).toContain('\\files\\')
  })
})

describe('buildCommand', () => {
  test('calls powershell.exe, never pwsh', () => {
    const { file } = buildCommand(FILE)
    expect(file).toBe('powershell.exe')
  })

  test('uses -LiteralPath so square brackets are not wildcards', () => {
    const { args } = buildCommand(WITH_BRACKETS)
    const command = args.join(' ')
    expect(command).toContain('-LiteralPath')
    expect(command).toContain('handbook [PL].pdf')
  })

  test('passes -NoProfile and -STA', () => {
    const { args } = buildCommand(FILE)
    expect(args).toContain('-NoProfile')
    expect(args).toContain('-STA')
  })
})

describe('setClipboardFile', () => {
  test('runs the command it built', async () => {
    const calls = []
    await setClipboardFile(FILE, async (file, args) => {
      calls.push({ file, args })
    })
    expect(calls).toHaveLength(1)
    expect(calls[0].file).toBe('powershell.exe')
  })

  test('an empty path runs nothing', async () => {
    const calls = []
    await setClipboardFile('', async () => calls.push(1))
    expect(calls).toHaveLength(0)
  })
})

describe('createClipboardSession', () => {
  // The stand-in answers on stdout the way the real PowerShell does: a DONE marker after
  // every command, prefixed by an ERROR line when the path is the one that fails.
  function fakeProcess() {
    const stdin = new PassThrough()
    const stdout = new PassThrough()
    stdout.setEncoding('utf8')
    const sent = []
    stdin.on('data', (chunk) => {
      const text = String(chunk)
      sent.push(text)
      if (text.includes('FAILURE')) stdout.write(`ERROR filePath does not exist\n${DONE_MARKER}\n`)
      else stdout.write(`${DONE_MARKER}\n`)
    })
    return { stdin, stdout, stderr: new PassThrough(), exitCode: null, killed: false, on() {}, sent }
  }

  test('sends Set-Clipboard with the path quoted', async () => {
    const fake = fakeProcess()
    const session = createClipboardSession(() => fake)

    await session.setFile(WITH_BRACKETS)

    expect(fake.sent.join('')).toContain("Set-Clipboard -LiteralPath 'C:\\files\\handbook [PL].pdf'")
  })

  test('the second insertion reuses the same process', async () => {
    const fake = fakeProcess()
    let starts = 0
    const session = createClipboardSession(() => {
      starts += 1
      return fake
    })

    await session.setFile('C:\\a.pdf')
    await session.setFile('C:\\b.pdf')

    expect(starts).toBe(1)
  })

  test('a PowerShell error rejects rather than going quiet', async () => {
    const session = createClipboardSession(() => fakeProcess())
    await expect(session.setFile('C:\\FAILURE.pdf')).rejects.toThrow(/filePath does not exist/)
  })

  test('an empty path starts no process', async () => {
    let starts = 0
    const session = createClipboardSession(() => {
      starts += 1
      return fakeProcess()
    })

    await session.setFile('')

    expect(starts).toBe(0)
  })
})
