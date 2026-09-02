// Where a file from an account goes, and under what name. Kept out of main.js because both
// answers are pure functions of their inputs, and both have edge cases worth stating in a test
// rather than discovering on a file that is already gone.
import path from 'node:path'

// An empty setting means the system Downloads folder, and it is resolved HERE – when a
// download starts – rather than being written into the layout file. A layout copied to another
// machine must not carry a path that exists nowhere.
export function resolveDownloadDir(configured, systemDownloads) {
  const chosen = String(configured ?? '').trim()
  return chosen || systemDownloads
}

// What happens to a file the moment it starts arriving: either the operator is asked, or the
// application picks the path. It is a function of its arguments and nothing else, because the
// asking branch ends in a modal save dialog and no end-to-end test can answer a modal – every
// download test has to turn the question off, which left the DEFAULT behaviour of this
// application as the one branch nothing exercised.
//
// Anything other than an explicit false means asking. A damaged layout file must not turn into
// silently writing files somewhere the operator never chose.
export function planSave({ ask, folder, filename, exists }) {
  if (ask !== false) return { mode: 'dialog', defaultPath: path.join(folder, filename) }
  return { mode: 'path', savePath: uniquePath(folder, filename, exists) }
}

// Chromium uniquifies a name only while it is choosing the path itself. Once setSavePath has
// been called the path is taken literally, so the same attachment downloaded twice would
// overwrite the first copy without a word.
//
// The number goes before the LAST dot, so "kopia.tar.gz" becomes "kopia.tar (2).gz" – not
// what a person would call tidy, but the file still opens, which matters more.
export function uniquePath(dir, filename, exists) {
  const ext = path.extname(filename)
  const stem = path.basename(filename, ext)
  let candidate = path.join(dir, filename)
  let n = 2
  while (exists(candidate)) {
    candidate = path.join(dir, `${stem} (${n})${ext}`)
    n += 1
  }
  return candidate
}
