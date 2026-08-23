import { describe, test, expect } from 'vitest'
import { licznikZTytulu, czystyUserAgent } from '../src/glowny/widoki.js'

describe('czystyUserAgent', () => {
  test('usuwa znacznik Electrona', () => {
    const ua = czystyUserAgent('Mozilla/5.0 Chrome/141.0.0.0 Electron/43.4.1 Safari/537.36')
    expect(ua).not.toMatch(/Electron/)
    expect(ua).toContain('Chrome/141.0.0.0')
  })

  test('usuwa nazwe aplikacji', () => {
    expect(czystyUserAgent('Mozilla/5.0 msg-hub/0.1.0 Chrome/141.0.0.0')).not.toMatch(/msg-hub/)
  })
})

describe('licznikZTytulu', () => {
  test('czyta licznik z nawiasu', () => {
    expect(licznikZTytulu('(3) WhatsApp')).toBe(3)
  })

  test('czyta licznik wielocyfrowy', () => {
    expect(licznikZTytulu('(12) Messenger')).toBe(12)
  })

  test('brak licznika daje zero', () => {
    expect(licznikZTytulu('WhatsApp')).toBe(0)
  })

  test('pusty tytul daje zero', () => {
    expect(licznikZTytulu('')).toBe(0)
  })
})
