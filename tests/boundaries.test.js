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
    .filter((relative) => relative.endsWith('.js') || relative.endsWith('.cjs'))
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
      if (/executeJavaScript|insertCSS|wppconnect|WPP\./.test(content)) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })

  test('the scan really catches a forbidden call, not merely a comment', () => {
    const sample = "// executeJavaScript inside a comment\nview.webContents.insertCSS('x')"
    expect(/executeJavaScript|insertCSS/.test(withoutComments(sample))).toBe(true)
    expect(/executeJavaScript/.test(withoutComments('// executeJavaScript\nconst a = 1'))).toBe(false)
  })
})
