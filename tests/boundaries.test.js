import { describe, test, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const ZAKAZANE_PAKIETY = [
  '@wppconnect/wa-js',
  'wppconnect',
  'whatsapp-web.js',
  '@whiskeysockets/baileys',
  'baileys',
  'venom-bot',
]

// A comment describing the prohibition is not a breach of it — only a call in the code
// counts. The scan therefore skips whole-line and block comments.
function bezKomentarzy(content) {
  const bezBlokowych = content.replace(/\/\*[\s\S]*?\*\//g, '')
  return bezBlokowych
    .split('\n')
    .filter((linia) => !/^\s*\/\//.test(linia))
    .join('\n')
}

function plikiZrodlowe(dir) {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((relative) => relative.endsWith('.js') || relative.endsWith('.cjs'))
    .map((relative) => path.join(dir, relative))
}

describe('rule 7.2, no interference with the pages Meta serves', () => {
  test('package.json carries no library that reaches into WhatsApp Web', () => {
    const pakiet = JSON.parse(readFileSync('package.json', 'utf8'))
    const zaleznosci = Object.keys({ ...pakiet.dependencies, ...pakiet.devDependencies })
    for (const zakazany of ZAKAZANE_PAKIETY) {
      expect(zaleznosci).not.toContain(zakazany)
    }
  })

  test('the source injects neither scripts nor styles into account views', () => {
    const offenders = []
    for (const file of plikiZrodlowe('src')) {
      const content = bezKomentarzy(readFileSync(file, 'utf8'))
      if (/executeJavaScript|insertCSS|wppconnect|WPP\./.test(content)) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })

  test('the scan really catches a forbidden call, not merely a comment', () => {
    const probka = "// executeJavaScript w komentarzu\nwidok.webContents.insertCSS('x')"
    expect(/executeJavaScript|insertCSS/.test(bezKomentarzy(probka))).toBe(true)
    expect(/executeJavaScript/.test(bezKomentarzy('// executeJavaScript\nconst a = 1'))).toBe(false)
  })
})
