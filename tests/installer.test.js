import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// The installer is configuration, not code, and configuration fails LATE: electron-builder
// only reads it when the build reaches packaging, minutes into a CI run that has already run
// every other test. These are the properties worth learning about in one second instead.
const nsis = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).build.nsis

describe('the installer', () => {
  // Running the installer over an existing copy already replaced it — NSIS uninstalls the old
  // version first — but the wizard asked for an install mode and a directory on the way, so an
  // upgrade looked exactly like a first installation. With nothing to ask, there is nothing to
  // look like.
  test('installs in one click, asking nothing', () => {
    expect(nsis.oneClick).toBe(true)
  })

  // electron-builder refuses this pair outright:
  //   "allowToChangeInstallationDirectory makes sense only for assisted installer"
  // It is an InvalidConfigurationError thrown during packaging, so without this test the first
  // sign of it is a failed release build.
  test('carries no directory page, which one-click installation forbids', () => {
    expect(nsis).not.toHaveProperty('allowToChangeInstallationDirectory')
  })

  // The reason anyone can install this without asking their IT department. A one-click
  // installer that went per-machine would raise a UAC prompt and dead-end on a locked-down
  // account — the exact case this application was carried onto in August 2026.
  test('installs for the current user, so no administrator password is needed', () => {
    expect(nsis.perMachine).toBe(false)
  })
})
