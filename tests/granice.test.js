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

// Komentarz opisujacy zakaz nie jest jego zlamaniem — liczy sie wywolanie w kodzie.
// Dlatego skan pomija komentarze pelnoliniowe i blokowe.
function bezKomentarzy(tresc) {
  const bezBlokowych = tresc.replace(/\/\*[\s\S]*?\*\//g, '')
  return bezBlokowych
    .split('\n')
    .filter((linia) => !/^\s*\/\//.test(linia))
    .join('\n')
}

function plikiZrodlowe(katalog) {
  return readdirSync(katalog, { recursive: true, encoding: 'utf8' })
    .filter((wzgledna) => wzgledna.endsWith('.js') || wzgledna.endsWith('.cjs'))
    .map((wzgledna) => path.join(katalog, wzgledna))
}

describe('regula 7.2 — zadnej ingerencji w strony Meta', () => {
  test('package.json nie zawiera bibliotek ingerujacych w WhatsApp Web', () => {
    const pakiet = JSON.parse(readFileSync('package.json', 'utf8'))
    const zaleznosci = Object.keys({ ...pakiet.dependencies, ...pakiet.devDependencies })
    for (const zakazany of ZAKAZANE_PAKIETY) {
      expect(zaleznosci).not.toContain(zakazany)
    }
  })

  test('kod zrodlowy nie wstrzykuje skryptow ani stylow do widokow kont', () => {
    const winowajcy = []
    for (const plik of plikiZrodlowe('src')) {
      const tresc = bezKomentarzy(readFileSync(plik, 'utf8'))
      if (/executeJavaScript|insertCSS|wppconnect|WPP\./.test(tresc)) winowajcy.push(plik)
    }
    expect(winowajcy).toEqual([])
  })

  test('skan naprawde lapie zakazane wywolanie, a nie tylko komentarz', () => {
    const probka = "// executeJavaScript w komentarzu\nwidok.webContents.insertCSS('x')"
    expect(/executeJavaScript|insertCSS/.test(bezKomentarzy(probka))).toBe(true)
    expect(/executeJavaScript/.test(bezKomentarzy('// executeJavaScript\nconst a = 1'))).toBe(false)
  })
})
