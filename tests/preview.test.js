import { describe, test, expect } from 'vitest'
import { toHtml } from '../src/renderer/preview.js'

describe('toHtml', () => {
  test('bold between asterisks', () => {
    expect(toHtml('*wazne*')).toContain('<strong>wazne</strong>')
  })

  test('italics between underscores', () => {
    expect(toHtml('_uwaga_')).toContain('<em>uwaga</em>')
  })

  test('strikethrough between tildes', () => {
    expect(toHtml('~stare~')).toContain('<del>stare</del>')
  })

  test('a bulleted list from a dash', () => {
    const html = toHtml('- first\n- second')
    expect(html).toContain('<li>first</li>')
    expect(html).toContain('<li>second</li>')
  })

  test('a numbered list from a digit and a dot', () => {
    expect(toHtml('1. krok')).toContain('<li>krok</li>')
  })

  test('a quote from the greater-than sign', () => {
    expect(toHtml('> uwaga')).toContain('<blockquote>uwaga</blockquote>')
  })

  test('HTML characters are escaped so the preview runs no code', () => {
    const html = toHtml('<img src=x onerror=alert(1)>')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })

  test('empty text yields an empty result', () => {
    expect(toHtml('')).toBe('')
  })
})
