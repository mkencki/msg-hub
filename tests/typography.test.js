import { describe, test, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Named by code point rather than written out. This file is one of the files it reads, so a
// literal would make the check fail on its own source, and the rule would then need an exemption
// for the very file that enforces it. The code points are also what docs/typography.md cites,
// because an em dash and an en dash are not reliably told apart by eye in a terminal font.
const EM_DASH = String.fromCodePoint(0x2014)
const LEFT_DOUBLE_QUOTE = String.fromCodePoint(0x201c)
const LEFT_SINGLE_QUOTE = String.fromCodePoint(0x2018)
const RIGHT_SINGLE_QUOTE = String.fromCodePoint(0x2019)
const POLISH_OPENING_QUOTE = String.fromCodePoint(0x201e)
const POLISH_CLOSING_QUOTE = String.fromCodePoint(0x201d)

const ROOT = fileURLToPath(new URL('..', import.meta.url))

// Binaries have no typography, package-lock.json is written by npm, and LICENSE carries somebody
// else's words. A rule that cannot be obeyed by editing the file does not belong in the check.
const BINARY = /\.(png|ico|icns|jpe?g|gif|webp|woff2?|ttf|otf|zip|exe|mp4)$/i
const NOT_OURS = new Set(['package-lock.json', 'LICENSE'])

const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
  .split('\0')
  .filter((file) => file && !BINARY.test(file) && !NOT_OURS.has(file))

const files = new Map(tracked.map((file) => [file, readFileSync(path.join(ROOT, file), 'utf8')]))

// A list of places, not a count: a failure has to say where to go, or it only says to go looking.
const placesUsing = (character) =>
  [...files].flatMap(([file, text]) =>
    text
      .split('\n')
      .map((line, index) => (line.includes(character) ? `${file}:${index + 1}` : null))
      .filter(Boolean),
  )

const occurrences = (text, character) => text.split(character).length - 1

describe('typography', () => {
  test('no tracked text file uses an em dash', () => {
    expect(placesUsing(EM_DASH)).toEqual([])
  })

  test('the only quotation marks are the Polish pair and the ASCII ones', () => {
    expect([
      ...placesUsing(LEFT_DOUBLE_QUOTE),
      ...placesUsing(LEFT_SINGLE_QUOTE),
      ...placesUsing(RIGHT_SINGLE_QUOTE),
    ]).toEqual([])
  })

  test('every Polish opening quote has a closing one', () => {
    const unbalanced = [...files]
      .filter(
        ([, text]) =>
          occurrences(text, POLISH_OPENING_QUOTE) !== occurrences(text, POLISH_CLOSING_QUOTE),
      )
      .map(([file]) => file)

    expect(unbalanced).toEqual([])
  })
})
