import { describe, test, expect } from 'vitest'
import { insertText } from '../src/main/insertion.js'

function fakeWebContents() {
  const calls = []
  return {
    calls,
    paste: () => calls.push('paste'),
    sendInputEvent: (event) => calls.push(`sendInputEvent:${event?.keyCode ?? '?'}`),
    executeJavaScript: (code) => calls.push(`executeJavaScript:${code}`),
    focus: () => calls.push('focus'),
  }
}

function fakeClipboard() {
  const writes = []
  return { writes, writeText: (text) => writes.push(text) }
}

describe('insertText', () => {
  test('puts the text on the clipboard and triggers a paste', () => {
    const webContents = fakeWebContents()
    const clipboard = fakeClipboard()

    insertText(webContents, '*Test*', clipboard)

    expect(clipboard.writes).toEqual(['*Test*'])
    expect(webContents.calls).toContain('paste')
  })

  test('does NOT send a message: no Enter, no script on the page', () => {
    const webContents = fakeWebContents()
    insertText(webContents, 'any content', fakeClipboard())

    const forbidden = webContents.calls.filter(
      (call) => call.startsWith('sendInputEvent') || call.startsWith('executeJavaScript'),
    )
    expect(forbidden).toEqual([])
  })

  test('empty text touches neither the clipboard nor the view', () => {
    const webContents = fakeWebContents()
    const clipboard = fakeClipboard()

    insertText(webContents, '', clipboard)

    expect(clipboard.writes).toEqual([])
    expect(webContents.calls).toEqual([])
  })
})
