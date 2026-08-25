import { describe, test, expect } from 'vitest'
import { encodeBmp } from '../build/bmp.mjs'

// NSIS hands these bytes to the plain Win32 bitmap loader, which reads a bottom-up 24-bit
// BI_RGB image with every row padded to four bytes. There is no validation anywhere on that
// path: a wrong field does not fail the build, it draws a garbled wizard page. Every number
// below is one the loader actually reads.

const PIXELS = 54

const image = (width, height, rgb) => encodeBmp({ width, height, rgb: Buffer.from(rgb) })

describe('encodeBmp', () => {
  test('writes the headers a Win32 loader expects', () => {
    const bmp = image(2, 2, new Array(2 * 2 * 3).fill(0))

    expect(bmp.subarray(0, 2).toString('ascii')).toBe('BM')
    expect(bmp.readUInt32LE(2)).toBe(bmp.length)
    expect(bmp.readUInt32LE(10)).toBe(PIXELS)
    expect(bmp.readUInt32LE(14)).toBe(40)
    expect(bmp.readInt32LE(18)).toBe(2)
    expect(bmp.readInt32LE(22)).toBe(2)
    expect(bmp.readUInt16LE(26)).toBe(1)
    expect(bmp.readUInt16LE(28)).toBe(24)
    expect(bmp.readUInt32LE(30)).toBe(0)
  })

  test('stores a pixel as blue, green, red', () => {
    const bmp = image(1, 1, [0xff, 0x11, 0x22])

    expect([...bmp.subarray(PIXELS, PIXELS + 3)]).toEqual([0x22, 0x11, 0xff])
  })

  test('writes the rows from the bottom up', () => {
    // One column, two rows: red on top of blue. The file has to start with the blue one.
    const bmp = image(1, 2, [0xff, 0x00, 0x00, 0x00, 0x00, 0xff])

    expect([...bmp.subarray(PIXELS, PIXELS + 3)]).toEqual([0xff, 0x00, 0x00])
    expect([...bmp.subarray(PIXELS + 4, PIXELS + 7)]).toEqual([0x00, 0x00, 0xff])
  })

  test('pads every row to four bytes', () => {
    // Three pixels are nine bytes, and a row may not end on an odd address.
    const bmp = image(3, 1, new Array(9).fill(0x7f))

    expect(bmp.length).toBe(PIXELS + 12)
    expect([...bmp.subarray(PIXELS + 9)]).toEqual([0, 0, 0])
  })
})
