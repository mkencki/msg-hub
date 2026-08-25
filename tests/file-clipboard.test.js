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

describe('createClipboardSession — the session that has to survive a bad day', () => {
  // A stand-in that answers nothing at all, the way a PowerShell busy with a slow network
  // path does.
  function silentProcess() {
    const stdin = new PassThrough()
    const stdout = new PassThrough()
    stdout.setEncoding('utf8')
    const sent = []
    let killed = false
    stdin.on('data', (chunk) => sent.push(String(chunk)))
    return {
      stdin,
      stdout,
      stderr: new PassThrough(),
      exitCode: null,
      get killed() {
        return killed
      },
      kill() {
        killed = true
      },
      on() {},
      sent,
    }
  }

  // stdio is ['pipe','pipe','pipe'], so the child writes its errors into a pipe with a
  // finite buffer. Nobody was reading it. A PowerShell that says enough on stderr fills that
  // buffer and then BLOCKS — and every attachment after it waits out the timeout.
  test('the child’s stderr is drained, or the child eventually blocks on it', () => {
    const fake = silentProcess()

    createClipboardSession(() => fake).warmUp()

    expect(fake.stderr.listenerCount('data')).toBeGreaterThan(0)
  })

  // The defect this exists for. A timed-out command was abandoned, but its output was left
  // in the pipe. The next insertion read the marker belonging to the PREVIOUS file and
  // reported success for a file it never put on the clipboard — for the rest of the session.
  test('a timed-out command cannot answer for the next one', async () => {
    const fakes = []
    const session = createClipboardSession(
      () => {
        const fake = silentProcess()
        fakes.push(fake)
        return fake
      },
      { timeoutMs: 200 },
    )

    await expect(session.setFile('C:\slow.pdf')).rejects.toThrow(/did not answer/)

    // The answer arrives late, into the pipe the abandoned command was reading.
    fakes[0].stdout.write(`${DONE_MARKER}\n`)

    const second = session.setFile('C:\next.pdf')
    // Comfortably inside the second command's own timeout, so what is being observed is
    // the answer not arriving rather than the command giving up.
    await new Promise((done) => setTimeout(done, 40))
    // Nothing has answered the SECOND command, so it must still be waiting rather than
    // reporting the first one's success.
    await expect(Promise.race([second, Promise.resolve('still waiting')])).resolves.toBe('still waiting')

    fakes[1].stdout.write(`${DONE_MARKER}\n`)
    await expect(second).resolves.toBeUndefined()
  })

  test('a timed-out session is put down rather than reused', async () => {
    const fakes = []
    const session = createClipboardSession(
      () => {
        const fake = silentProcess()
        fakes.push(fake)
        return fake
      },
      { timeoutMs: 20 },
    )

    await expect(session.setFile('C:\slow.pdf')).rejects.toThrow()
    session.setFile('C:\next.pdf').catch(() => {})

    expect(fakes).toHaveLength(2)
    expect(fakes[0].killed).toBe(true)
  })
})
