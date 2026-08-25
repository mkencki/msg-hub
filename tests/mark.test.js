import { describe, test, expect } from 'vitest'
import { renderSidebar, renderHeader } from '../build/mark.mjs'

// The two bitmaps the installer wears. Nothing downstream checks them: electron-builder
// passes whatever it finds under build/ straight to NSIS, and a sidebar drawn upside down,
// in the wrong size, or in the wrong colours reaches the operator as a finished installer.
// The probes below are coordinates on the drawing, read back out of the pixels.

const at = ({ width, rgb }, x, y) => {
  const offset = (y * width + x) * 3
  return '#' + rgb.subarray(offset, offset + 3).toString('hex').toUpperCase()
}

describe('the installer sidebar', () => {
  const sidebar = renderSidebar()

  test('is the size MUI_WELCOMEFINISHPAGE_BITMAP is drawn at', () => {
    expect([sidebar.width, sidebar.height]).toEqual([164, 314])
    expect(sidebar.rgb.length).toBe(164 * 314 * 3)
  })

  test('carries the mark on the dark field', () => {
    expect(at(sidebar, 5, 5)).toBe('#0E1216') // field
    expect(at(sidebar, 82, 80)).toBe('#151A20') // the tile, above the modules
    expect(at(sidebar, 57, 124)).toBe('#E4E8EC') // first module
    expect(at(sidebar, 107, 124)).toBe('#D9822B') // the active one
    expect(at(sidebar, 82, 250)).toBe('#0E1216') // field again, below the tile
  })

  test('closes on an amber rule against the white page beside it', () => {
    expect(at(sidebar, 162, 200)).toBe('#D9822B')
  })
})

describe('the installer header', () => {
  const header = renderHeader()

  test('is the size MUI_HEADERIMAGE_BITMAP is drawn at', () => {
    expect([header.width, header.height]).toEqual([150, 57])
  })

  // electron-builder defines MUI_HEADERIMAGE_RIGHT, and MUI paints the bar itself white.
  // A dark field here would read as a dark rectangle glued to a white strip.
  test('sits at the right end of a white bar', () => {
    expect(at(header, 2, 2)).toBe('#FFFFFF')
    expect(at(header, 20, 28)).toBe('#FFFFFF')
    expect(at(header, 121, 12)).toBe('#151A20')
    expect(at(header, 130, 28)).toBe('#D9822B')
  })
})
