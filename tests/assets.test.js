import { describe, test, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { WINDOW_ICON, TRAY_ICON } from '../src/main/assets.js'

// Both of these fail silently in the product: Electron ignores a window icon it cannot load,
// and a Tray built from an empty image is invisible rather than an error. So the only way a
// typo in either path becomes visible is a test that opens the file.
//
// This is not hypothetical. Measured 2026-08-25, with both paths pointed at names that do not
// exist: 215 unit tests and 7 end-to-end tests passed. These four are what that mutation now
// runs into.
describe('the files the shell loads by path', () => {
  test('the window icon exists where the application looks for it', () => {
    expect(existsSync(WINDOW_ICON)).toBe(true)
  })

  test('the tray icon exists where the application looks for it', () => {
    expect(existsSync(TRAY_ICON)).toBe(true)
  })

  // Existing is not the same as loadable. A truncated or wrongly named file would pass the
  // check above and still leave the tray empty.
  test('the window icon really is an icon', () => {
    const ico = readFileSync(WINDOW_ICON)
    expect(ico.readUInt16LE(0)).toBe(0) // reserved
    expect(ico.readUInt16LE(2)).toBe(1) // type: icon
    expect(ico.readUInt16LE(4)).toBeGreaterThan(1) // more than one frame
  })

  test('the tray icon really is a PNG', () => {
    expect(readFileSync(TRAY_ICON).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  })
})
