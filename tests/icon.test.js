import { describe, test, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildIco, ICO_SIZES } from '../build/ico.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const icons = (name) => path.join(ROOT, 'src', 'renderer', 'icons', name)

// The width byte of a directory entry is a single byte, so 256 is written as zero and read
// back as 256. Reading the sizes out is the only way to know what an .ico actually offers.
const framesOf = (ico) =>
  Array.from({ length: ico.readUInt16LE(4) }, (_, i) => ico[6 + i * 16] || 256)

describe('the application icon', () => {
  // Windows does not draw this at 256 pixels anywhere it matters. The taskbar asks for 16 or
  // 24, Alt+Tab for 32, Explorer for whatever the view is set to – and the shell scaling one
  // large bitmap down is visibly worse than a frame drawn for that size. The icon this
  // project shipped until 0.3.0 carried exactly one frame, 256 square, which is why this
  // test exists rather than a comment.
  test('carries every size Windows asks for', async () => {
    expect(framesOf(await readFile(icons('app.ico')))).toEqual(ICO_SIZES)
  })

  // Two derived files, one source. Without this they drift apart, and the drift is invisible
  // until the installer ships a different mark from the one in the running window.
  test('is exactly what the PNG set assembles to, in both places it is needed', async () => {
    const frames = await Promise.all(
      ICO_SIZES.map(async (size) => ({ size, png: await readFile(icons(`icon-${size}.png`)) })),
    )
    const assembled = buildIco(frames)

    expect(await readFile(icons('app.ico'))).toEqual(assembled)
    expect(await readFile(path.join(ROOT, 'build', 'icon.ico'))).toEqual(assembled)
  })

  // The frames are PNGs embedded whole – the format has allowed that since Vista, and it is
  // what makes an assembler this small possible. A frame that came out as something else
  // would still parse as an icon and still fail to draw.
  test('every frame is a PNG, not a headless bitmap', async () => {
    const ico = await readFile(icons('app.ico'))
    for (let i = 0; i < ico.readUInt16LE(4); i += 1) {
      const offset = ico.readUInt32LE(6 + i * 16 + 12)
      expect(ico.subarray(offset, offset + 8).toString('hex')).toBe('89504e470d0a1a0a')
    }
  })

  // The tray takes a 32 and halves it. An exact division, unlike 256 into 16, and the reason
  // the small sizes are kept as separate files rather than only inside the .ico.
  test('keeps the small sizes as files the application can load directly', async () => {
    for (const size of [16, 24, 32]) {
      const png = await readFile(icons(`icon-${size}.png`))
      expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
      // IHDR width, big-endian, right after the 8-byte signature and the 8-byte chunk header.
      expect(png.readUInt32BE(16)).toBe(size)
    }
  })
})
