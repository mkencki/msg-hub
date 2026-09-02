import { describe, test, expect } from 'vitest'
import { findVariables, fillVariables, AUTOMATIC } from '../src/shared/variables.js'

const noon = new Date('2026-08-25T12:00:00Z')

describe('findVariables', () => {
  test('finds what the operator will be asked for', () => {
    expect(findVariables('Hello {name}, about the order for {company}.')).toEqual(['name', 'company'])
  })

  test('asks once for a name used twice', () => {
    expect(findVariables('{name}, thank you {name}')).toEqual(['name'])
  })

  test('the date fills itself, so nobody is asked for it', () => {
    expect(findVariables('Sent on {date}.')).toEqual([])
    expect(findVariables('Wysłano {data}.')).toEqual([])
  })

  // Braces are ordinary characters in a message. Anything that is not shaped like a name is
  // left alone rather than turned into a question.
  test('braces that are not a name are not a variable', () => {
    expect(findVariables('use {} or { } or {this is a whole sentence, really}')).toEqual([])
    expect(findVariables('nothing here at all')).toEqual([])
  })

  test('a Polish name is a name', () => {
    expect(findVariables('Dzień dobry {imię}, w sprawie {firma}')).toEqual(['imię', 'firma'])
  })
})

describe('fillVariables', () => {
  test('every occurrence is replaced, not only the first', () => {
    expect(fillVariables('{name}, hello {name}', { name: 'Anna' })).toBe('Anna, hello Anna')
  })

  test('the date is filled without being asked for', () => {
    expect(fillVariables('Sent on {date}.', {}, { now: noon })).toBe('Sent on 2026-08-25.')
    expect(fillVariables('Wysłano {data}.', {}, { now: noon })).toBe('Wysłano 2026-08-25.')
  })

  // A macro that has none must come out exactly as it went in – this is the path every
  // existing macro takes, and it may not change by a single character.
  test('a macro without variables is returned untouched', () => {
    const text = 'Good morning.\n\nThe *guide* is attached – {see} nothing here { }.'
    expect(fillVariables(text, {}, { now: noon })).toBe(text)
  })

  test('a name nobody answered for is left as it was written', () => {
    expect(fillVariables('Hello {name}', {})).toBe('Hello {name}')
  })

  test('an empty answer is an answer, and clears the placeholder', () => {
    expect(fillVariables('Hello {name}.', { name: '' })).toBe('Hello .')
  })

  // A value that itself looks like a placeholder must not be substituted a second time,
  // or answering "{date}" would quietly become today's date.
  test('a value is not looked at again for variables of its own', () => {
    expect(fillVariables('{a}', { a: '{date}' }, { now: noon })).toBe('{date}')
  })

  test('the automatic names are declared, not scattered through the code', () => {
    expect(AUTOMATIC).toEqual(['date', 'data'])
  })
})
