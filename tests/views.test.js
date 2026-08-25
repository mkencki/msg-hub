import { describe, test, expect } from 'vitest'
import { unreadFromTitle, cleanUserAgent, createView, ViewManager } from '../src/main/views.js'

describe('cleanUserAgent', () => {
  test('strips the Electron marker', () => {
    const ua = cleanUserAgent('Mozilla/5.0 Chrome/141.0.0.0 Electron/43.4.1 Safari/537.36')
    expect(ua).not.toMatch(/Electron/)
    expect(ua).toContain('Chrome/141.0.0.0')
  })

  // Electron builds the default User-Agent out of the application's own name, so this
  // function had that name written into it as a literal. Rename the application and the
  // literal stops matching — quietly, with the new name going out to Meta's servers on
  // every request. The name is a parameter for that reason, and these two cases are the
  // same string with a different name in it.
  test('strips the application name it is given', () => {
    expect(cleanUserAgent('Mozilla/5.0 msg-hub/0.1.0 Chrome/141.0.0.0', 'msg-hub')).not.toMatch(
      /msg-hub/i,
    )
  })

  test('strips a different application name just as well', () => {
    expect(cleanUserAgent('Mozilla/5.0 M-HUB/0.5.0 Chrome/141.0.0.0', 'M-HUB')).not.toMatch(
      /M-HUB/i,
    )
  })

  test('leaves the rest of the string alone', () => {
    const ua = cleanUserAgent('Mozilla/5.0 (Windows NT 10.0) M-HUB/0.5.0 Chrome/141.0.0.0', 'M-HUB')
    expect(ua).toBe('Mozilla/5.0 (Windows NT 10.0) Chrome/141.0.0.0')
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

describe('unreadFromTitle at the edges', () => {
  // LinkedIn's own title writer, lifted from its production bundle:
  //   document.title = r > 99 ? `(99+) ${e}` : r > 0 ? `(${r}) ${e}` : e
  // The old pattern demanded digits and a closing bracket, so it read "(99+) LinkedIn" as
  // zero — the badge vanished exactly when the account was busiest.
  test('a service that says 99+ is not read as nothing', () => {
    expect(unreadFromTitle('(99+) LinkedIn')).toBe(99)
  })

  test('an ordinary count still reads as itself', () => {
    expect(unreadFromTitle('(7) LinkedIn')).toBe(7)
  })

  test('a plus somewhere else in the title is not a count', () => {
    expect(unreadFromTitle('Google+ — WhatsApp')).toBe(0)
    expect(unreadFromTitle('(+) WhatsApp')).toBe(0)
  })
})

describe('which accounts the badge believes', () => {
  const fakeView = (title) => ({
    webContents: { isDestroyed: () => false, getTitle: () => title },
    setBounds() {},
    setVisible() {},
  })

  const managerWith = (entries) => {
    const manager = new ViewManager({ contentView: { addChildView() {} } }, 'UA')
    for (const [id, title, unreadInTitle] of entries) {
      manager.views.set(id, fakeView(title))
      manager.countsUnread.set(id, unreadInTitle)
    }
    return manager
  }

  test('a messenger title is counted', () => {
    expect(managerWith([['acc-w', '(3) WhatsApp', true]]).unreadByAccount()).toEqual({ 'acc-w': 3 })
  })

  // The declaration has to reach the badge, or it is a comment rather than a switch.
  test('a service that does not count messages shows nothing, whatever its title says', () => {
    expect(managerWith([['acc-l', '(12) LinkedIn', false]]).unreadByAccount()).toEqual({ 'acc-l': 0 })
  })

  test('the total leaves out the accounts that are not counting', () => {
    const manager = managerWith([
      ['acc-w', '(3) WhatsApp', true],
      ['acc-l', '(12) LinkedIn', false],
    ])
    expect(manager.unreadTotal()).toBe(3)
  })
})
