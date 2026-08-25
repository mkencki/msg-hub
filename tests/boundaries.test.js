import { describe, test, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const FORBIDDEN_PACKAGES = [
  '@wppconnect/wa-js',
  'wppconnect',
  'whatsapp-web.js',
  '@whiskeysockets/baileys',
  'baileys',
  'venom-bot',
]

// The calls that would break a boundary if they appeared in the source.
//
// sendInputEvent is here because rule 7.1 — the application never sends a message — had no
// repository-wide enforcement at all: only insertion.js was guarded, by its own negative test,
// while bridge.js reaches a view on a second path that test cannot see. A synthetic Enter is
// exactly how this application would start sending messages, and nothing was looking for it.
const FORBIDDEN_CALLS = /executeJavaScript|insertCSS|sendInputEvent|wppconnect|WPP\./

// A comment describing the prohibition is not a breach of it — only a call in the code
// counts. The scan therefore skips whole-line and block comments.
function withoutComments(content) {
  const withoutBlocks = content.replace(/\/\*[\s\S]*?\*\//g, '')
  return withoutBlocks
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n')
}

function sourceFiles(dir) {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    // .mjs included: without it a module under src/ would be skipped in silence by the one
    // test this project leans on hardest.
    .filter((relative) => /\.(js|cjs|mjs)$/.test(relative))
    .map((relative) => path.join(dir, relative))
}

describe('rule 7.2, no interference with the pages Meta serves', () => {
  test('package.json carries no library that reaches into WhatsApp Web', () => {
    const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
    const dependencies = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })
    for (const forbidden of FORBIDDEN_PACKAGES) {
      expect(dependencies).not.toContain(forbidden)
    }
  })

  test('the source injects neither scripts nor styles into account views', () => {
    const offenders = []
    for (const file of sourceFiles('src')) {
      const content = withoutComments(readFileSync(file, 'utf8'))
      if (FORBIDDEN_CALLS.test(content)) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })

  test('the scan really catches a forbidden call, not merely a comment', () => {
    const sample = "// executeJavaScript inside a comment\nview.webContents.insertCSS('x')"
    expect(/executeJavaScript|insertCSS/.test(withoutComments(sample))).toBe(true)
    expect(/executeJavaScript/.test(withoutComments('// executeJavaScript\nconst a = 1'))).toBe(false)
  })
})

describe('rule 7.1, the application does not send messages', () => {
  // insertion.js has its own negative test, but it is not the only place that reaches a view:
  // bridge.js pastes attachments on a second path that test never sees. A sendInputEvent
  // carrying Enter, added anywhere, would send a message for real — and until now nothing in
  // the repository looked for that call at all.
  test('no source file reaches for a synthetic key press', () => {
    const offenders = []
    for (const file of sourceFiles('src')) {
      if (FORBIDDEN_CALLS.test(withoutComments(readFileSync(file, 'utf8')))) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })

  test('the scan catches that call, and is not fooled by the warning about it', () => {
    const call = "view.webContents.sendInputEvent({ keyCode: 'Return' })"
    expect(FORBIDDEN_CALLS.test(withoutComments(call))).toBe(true)
    // insertion.js carries this very sentence, and it must not be read as a breach.
    expect(FORBIDDEN_CALLS.test(withoutComments('// Do not add sendInputEvent carrying Enter'))).toBe(false)
  })
})

describe('what the scan can see at all', () => {
  // The filter accepted .js and .cjs only, so an .mjs file anywhere under src/ would have been
  // skipped in silence — by the one test this project leans on hardest.
  test('an .mjs file is not invisible to the scan', () => {
    const found = sourceFiles('build').map((file) => path.basename(file))
    expect(found).toContain('ico.mjs')
  })
})
