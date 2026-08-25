// Placeholders in a macro. Shared, because the renderer asks for the values and the main
// process puts them in, and both have to agree on what counts as a placeholder.

// A name, not a sentence. Braces are ordinary characters in a message — "{}" and
// "{see the guide}" are things people write — so only something shaped like a single word
// becomes a question the operator has to answer.
const NAME = /\{([\p{L}\p{N}_-]{1,30})\}/gu

// Filled from the clock rather than asked for. Both spellings, because the interface is in
// two languages and someone writing a macro in Polish will reach for {data}; someone writing
// in English would never guess that spelling, and vice versa.
export const AUTOMATIC = ['date', 'data']

export function findVariables(text) {
  const found = []
  for (const [, name] of String(text ?? '').matchAll(NAME)) {
    if (AUTOMATIC.includes(name.toLowerCase())) continue
    if (!found.includes(name)) found.push(name)
  }
  return found
}

export function fillVariables(text, values = {}, { now = new Date() } = {}) {
  const today = now.toISOString().slice(0, 10)
  // One pass, so a value that happens to look like a placeholder is left as the operator
  // typed it rather than being substituted a second time.
  return String(text ?? '').replace(NAME, (whole, name) => {
    if (AUTOMATIC.includes(name.toLowerCase())) return today
    // A name nobody answered for stays as it was written: a macro is still readable with a
    // gap in it, and silently emptying one would be worse than leaving it visible.
    return Object.hasOwn(values, name) ? String(values[name]) : whole
  })
}
