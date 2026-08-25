// Shared, because both sides need the same answer: the renderer turns what was typed into a
// list before sending it, and the main process searches the list it stored. Living in
// src/main would put node:fs in the sandboxed renderer's import graph.

// Tags are typed as one line separated by commas, because that is how anyone types a short
// list. Case is settled here rather than at search time: search lowercases what it is looking
// for, so a tag stored with a capital would answer to "Zone" and be invisible to "zone" —
// which is what a person actually types.
export function parseTags(input) {
  const seen = new Set()
  for (const piece of String(input ?? '').split(',')) {
    const tag = piece.trim().toLowerCase()
    if (tag) seen.add(tag)
  }
  return [...seen]
}

// The way back, so the editor shows what was stored as something that can be edited rather
// than as a list rendered by a machine.
export function formatTags(tags) {
  return (tags ?? []).join(', ')
}
