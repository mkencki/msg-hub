// A 24-bit BI_RGB bitmap, which is the only format NSIS reads for the wizard graphics.
// Written by hand for the same reason the .ico is: the whole file is two headers and the
// pixels, so an encoder here costs less than a dependency to keep up to date.
//
// Two details are easy to get wrong and impossible to see in the code: the rows run from the
// BOTTOM of the image up, and every row is padded to a multiple of four bytes. Both are what
// tests/bmp.test.js is for.

const FILE_HEADER = 14
const DIB_HEADER = 40
const PIXELS = FILE_HEADER + DIB_HEADER

// 2835 pixels per metre is 72 dpi. Nothing on the NSIS path reads it, but a zero there makes
// some image viewers refuse the file, which would make the previews harder to check than the
// installer they are previews of.
const RESOLUTION = 2835

export function encodeBmp({ width, height, rgb }) {
  const stride = Math.ceil((width * 3) / 4) * 4
  const body = Buffer.alloc(stride * height)

  for (let y = 0; y < height; y += 1) {
    const row = (height - 1 - y) * stride
    for (let x = 0; x < width; x += 1) {
      const source = (y * width + x) * 3
      body[row + x * 3] = rgb[source + 2]
      body[row + x * 3 + 1] = rgb[source + 1]
      body[row + x * 3 + 2] = rgb[source]
    }
  }

  const header = Buffer.alloc(PIXELS)
  header.write('BM', 0, 'ascii')
  header.writeUInt32LE(PIXELS + body.length, 2)
  header.writeUInt32LE(PIXELS, 10)
  header.writeUInt32LE(DIB_HEADER, 14)
  header.writeInt32LE(width, 18)
  header.writeInt32LE(height, 22) // positive: the rows are stored bottom-up
  header.writeUInt16LE(1, 26) // planes
  header.writeUInt16LE(24, 28) // bits per pixel
  header.writeUInt32LE(0, 30) // BI_RGB, uncompressed
  header.writeUInt32LE(body.length, 34)
  header.writeInt32LE(RESOLUTION, 38)
  header.writeInt32LE(RESOLUTION, 42)

  return Buffer.concat([header, body])
}
