import { describe, test, expect } from 'vitest'
import { unreadFromTitle, cleanUserAgent, createView } from '../src/main/views.js'

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

describe('createView', () => {
  // A stand-in for WebContentsView: the question is what options the constructor is handed,
  // and a real one needs a running Electron main process to exist at all.
  class RecordingView {
    constructor(options) {
      RecordingView.lastOptions = options
      this.webContents = { setUserAgent() {}, on() {}, loadURL() {} }
    }
  }

  const account = { id: 'acc-sample', url: 'https://example.test/', name: 'Sample' }

  // Chromium treats a view of zero height as a hidden tab and slows its timers by an order
  // of magnitude — measured 2026-08-25: 101 ticks of a 100 ms timer in ten seconds while
  // active, 10 while hidden. Every account but the current one is exactly that, and once
  // the window is in the tray so is the current one. An app whose whole purpose is to
  // notice messages arriving must not put its accounts to sleep to save a little battery.
  test('an account in the background keeps running at full speed', () => {
    createView(account, 'UA', () => {}, RecordingView)

    expect(RecordingView.lastOptions.webPreferences.backgroundThrottling).toBe(false)
  })

  test('the isolated partition and the sandbox are not given up along the way', () => {
    createView(account, 'UA', () => {}, RecordingView)

    const preferences = RecordingView.lastOptions.webPreferences
    expect(preferences.partition).toBe('persist:acc-sample')
    expect(preferences.sandbox).toBe(true)
    expect(preferences.contextIsolation).toBe(true)
    expect(preferences.nodeIntegration).toBe(false)
  })
})
