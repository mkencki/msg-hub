import { describe, test, expect } from 'vitest'
import { naHtml } from '../src/renderer/podglad.js'

describe('naHtml', () => {
  test('pogrubienie miedzy gwiazdkami', () => {
    expect(naHtml('*wazne*')).toContain('<strong>wazne</strong>')
  })

  test('kursywa miedzy podkreslnikami', () => {
    expect(naHtml('_uwaga_')).toContain('<em>uwaga</em>')
  })

  test('przekreslenie miedzy tyldami', () => {
    expect(naHtml('~stare~')).toContain('<del>stare</del>')
  })

  test('lista punktowana z myslnika', () => {
    const html = naHtml('- pierwszy\n- drugi')
    expect(html).toContain('<li>pierwszy</li>')
    expect(html).toContain('<li>drugi</li>')
  })

  test('lista numerowana z cyfry i kropki', () => {
    expect(naHtml('1. krok')).toContain('<li>krok</li>')
  })

  test('cytat ze znaku wiekszosci', () => {
    expect(naHtml('> uwaga')).toContain('<blockquote>uwaga</blockquote>')
  })

  test('znaki HTML sa uciekane, zeby podglad nie wykonal kodu', () => {
    const html = naHtml('<img src=x onerror=alert(1)>')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })

  test('pusty tekst daje pusty wynik', () => {
    expect(naHtml('')).toBe('')
  })
})
