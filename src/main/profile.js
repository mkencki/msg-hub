import { rename, cp, rm, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

// Electron derives the profile directory from the application's name, and version 0.5.0
// was the release that gave it a productName. Everything written before that sits beside
// the current profile under the package name, which is what app.getName() returned while
// there was no productName to prefer. Measured on a real machine on 2026-08-27: three
// accounts and a macro, whole, in a directory the application had stopped reading.
export const LEGACY_PROFILE_DIR = 'msg-hub'

// accounts.json is LAST on purpose. Its presence in the new profile is what stops this
// from running a second time, so moving it first would strand whatever an interrupted run
// had not reached yet — the next start would find the guard satisfied and leave the
// sessions behind for good. Moved last, an interrupted migration finishes on the next start.
const CONTENTS = ['Partitions', 'att', 'macros.json', 'layout.json', 'uklad.json', 'accounts.json']

export async function migrateProfile({ from, to }) {
  const moved = []
  // Removing every account writes an empty list rather than deleting the file, so every
  // profile that has been used at all carries this file. Its absence is the only honest
  // signal that the new directory has never held anything — and the only way to be sure
  // this does not resurrect accounts somebody deliberately deleted.
  if (existsSync(path.join(to, 'accounts.json'))) return { moved }
  if (!existsSync(from)) return { moved }

  // main.js calls this before anything has written to the new profile, so the directory
  // Electron will use may not be on disk yet — and a rename into a missing directory fails.
  await mkdir(to, { recursive: true })

  for (const name of CONTENTS) {
    const source = path.join(from, name)
    const target = path.join(to, name)
    // Whatever the new profile already holds was written by the running application, and
    // is therefore newer than the copy the rename left behind.
    if (!existsSync(source) || existsSync(target)) continue
    await move(source, target)
    moved.push(name)
  }

  return { moved }
}

// Both directories live under %APPDATA%, so this is a metadata change however large the
// session data is — and sessions run to tens of megabytes each. Copying is the fallback
// for the one case a rename cannot serve: a profile redirected to another volume.
async function move(source, target) {
  try {
    await rename(source, target)
  } catch (error) {
    if (error.code !== 'EXDEV') throw error
    await cp(source, target, { recursive: true })
    await rm(source, { recursive: true, force: true })
  }
}
