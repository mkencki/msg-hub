import { describe, test, expect } from 'vitest'
import { unreadFromTitle, cleanUserAgent } from '../src/main/views.js'

describe('cleanUserAgent', () => {
  test('strips the Electron marker', () => {
    const ua = cleanUserAgent('Mozilla/5.0 Chrome/141.0.0.0 Electron/43.4.1 Safari/537.36')
    expect(ua).not.toMatch(/Electron/)
    expect(ua).toContain('Chrome/141.0.0.0')
  })

  test('strips the application name', () => {
    expect(cleanUserAgent('Mozilla/5.0 msg-hub/0.1.0 Chrome/141.0.0.0')).not.toMatch(/msg-hub/)
  })
})

describe('unreadFromTitle', () => {
  test('reads the counter out of the parentheses', () => {
    expect(unreadFromTitle('(3) WhatsApp')).toBe(3)
  })

  test('reads a multi-digit counter', () => {
    expect(unreadFromTitle('(12) Messenger')).toBe(12)
  })

  test('no counter yields zero', () => {
    expect(unreadFromTitle('WhatsApp')).toBe(0)
  })

  test('an empty title yields zero', () => {
    expect(unreadFromTitle('')).toBe(0)
  })
})
