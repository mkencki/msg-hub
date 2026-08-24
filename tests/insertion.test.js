import { describe, test, expect } from 'vitest'
import { insertText } from '../src/main/insertion.js'

function atrapaWebContents() {
  const calls = []
  return {
    calls,
    paste: () => calls.push('paste'),
    sendInputEvent: (event) => calls.push(`sendInputEvent:${event?.keyCode ?? '?'}`),
    executeJavaScript: (code) => calls.push(`executeJavaScript:${code}`),
    focus: () => calls.push('focus'),
  }
}

function atrapaSchowka() {
  const zapisy = []
  return { zapisy, writeText: (t) => zapisy.push(t) }
}

describe('insertText', () => {
  test('puts the text on the clipboard and triggers a paste', () => {
    const wc = atrapaWebContents()
    const schowek = atrapaSchowka()

    insertText(wc, '*Test*', schowek)

    expect(schowek.zapisy).toEqual(['*Test*'])
    expect(wc.calls).toContain('paste')
  })

  test('does NOT send a message: no Enter, no script on the page', () => {
    const wc = atrapaWebContents()
    insertText(wc, 'dowolna content', atrapaSchowka())

    const zakazane = wc.calls.filter(
      (w) => w.startsWith('sendInputEvent') || w.startsWith('executeJavaScript'),
    )
    expect(zakazane).toEqual([])
  })

  test('empty text touches neither the clipboard nor the view', () => {
    const wc = atrapaWebContents()
    const schowek = atrapaSchowka()

    insertText(wc, '', schowek)

    expect(schowek.zapisy).toEqual([])
    expect(wc.calls).toEqual([])
  })
})
