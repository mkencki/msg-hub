import { describe, test, expect } from 'vitest'
import { wstawTekst } from '../src/glowny/wstawianie.js'

function atrapaWebContents() {
  const wywolania = []
  return {
    wywolania,
    paste: () => wywolania.push('paste'),
    sendInputEvent: (zdarzenie) => wywolania.push(`sendInputEvent:${zdarzenie?.keyCode ?? '?'}`),
    executeJavaScript: (kod) => wywolania.push(`executeJavaScript:${kod}`),
    focus: () => wywolania.push('focus'),
  }
}

function atrapaSchowka() {
  const zapisy = []
  return { zapisy, writeText: (t) => zapisy.push(t) }
}

describe('wstawTekst', () => {
  test('kladzie tekst w schowku i wywoluje wklejenie', () => {
    const wc = atrapaWebContents()
    const schowek = atrapaSchowka()

    wstawTekst(wc, '*Test*', schowek)

    expect(schowek.zapisy).toEqual(['*Test*'])
    expect(wc.wywolania).toContain('paste')
  })

  test('NIE wysyla wiadomosci — zadnego Entera, zadnego skryptu na stronie', () => {
    const wc = atrapaWebContents()
    wstawTekst(wc, 'dowolna tresc', atrapaSchowka())

    const zakazane = wc.wywolania.filter(
      (w) => w.startsWith('sendInputEvent') || w.startsWith('executeJavaScript'),
    )
    expect(zakazane).toEqual([])
  })

  test('pusty tekst nie rusza schowka ani widoku', () => {
    const wc = atrapaWebContents()
    const schowek = atrapaSchowka()

    wstawTekst(wc, '', schowek)

    expect(schowek.zapisy).toEqual([])
    expect(wc.wywolania).toEqual([])
  })
})
