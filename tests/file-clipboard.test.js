import { describe, test, expect } from 'vitest'
import { PassThrough } from 'node:stream'
import {
  quotePS,
  buildCommand,
  setClipboardFile,
  createClipboardSession,
  DONE_MARKER,
} from '../src/main/file-clipboard.js'

describe('quotePS', () => {
  test('wraps the path in single quotes', () => {
    expect(quotePS('C:\pliki\a.pdf')).toBe("'C:\pliki\a.pdf'")
  })

  test('doubles single quotes, which is the guard against injection', () => {
    expect(quotePS("C:\pliki\o'brien.pdf")).toBe("'C:\pliki\o''brien.pdf'")
  })
})

describe('buildCommand', () => {
  test('calls powershell.exe, never pwsh', () => {
    const { file } = buildCommand('C:\a.pdf')
    expect(file).toBe('powershell.exe')
  })

  test('uses -LiteralPath so square brackets are not wildcards', () => {
    const { args } = buildCommand('C:\podrecznik [PL].pdf')
    const command = args.join(' ')
    expect(command).toContain('-LiteralPath')
    expect(command).toContain('podrecznik [PL].pdf')
  })

  test('passes -NoProfile and -STA', () => {
    const { args } = buildCommand('C:\a.pdf')
    expect(args).toContain('-NoProfile')
    expect(args).toContain('-STA')
  })
})

describe('setClipboardFile', () => {
  test('runs the command it built', async () => {
    const calls = []
    await setClipboardFile('C:\a.pdf', async (file, args) => {
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
  function atrapaProcesu() {
    const stdin = new PassThrough()
    const stdout = new PassThrough()
    stdout.setEncoding('utf8')
    const sent = []
    stdin.on('data', (kawalek) => {
      const text = String(kawalek)
      sent.push(text)
      if (text.includes('AWARIA')) stdout.write(`ERROR filePath nie istnieje\n${DONE_MARKER}\n`)
      else stdout.write(`${DONE_MARKER}\n`)
    })
    return { stdin, stdout, stderr: new PassThrough(), exitCode: null, killed: false, on() {}, sent }
  }

  test('sends Set-Clipboard with the path quoted', async () => {
    const fake = atrapaProcesu()
    const session = createClipboardSession(() => fake)

    await session.setFile('C:\pliki\podrecznik [PL].pdf')

    expect(fake.sent.join('')).toContain("Set-Clipboard -LiteralPath 'C:\pliki\podrecznik [PL].pdf'")
  })

  test('the second insertion reuses the same process', async () => {
    const fake = atrapaProcesu()
    let starty = 0
    const session = createClipboardSession(() => {
      starty += 1
      return fake
    })

    await session.setFile('C:\a.pdf')
    await session.setFile('C:\b.pdf')

    expect(starty).toBe(1)
  })

  test('a PowerShell error rejects rather than going quiet', async () => {
    const session = createClipboardSession(() => atrapaProcesu())
    await expect(session.setFile('C:\AWARIA.pdf')).rejects.toThrow(/filePath nie istnieje/)
  })

  test('an empty path starts no process', async () => {
    let starty = 0
    const session = createClipboardSession(() => {
      starty += 1
      return atrapaProcesu()
    })

    await session.setFile('')

    expect(starty).toBe(0)
  })
})
