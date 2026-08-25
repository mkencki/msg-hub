// Assembles a Windows .ico out of ready PNG frames. The format has allowed whole PNGs inside
// since Vista, so the entire file is a header, one directory entry per frame, and the frames
// themselves — no encoder to write and no dependency to keep up to date.
//
// 256 is the largest size an entry can address: width and height are single bytes, written as
// zero and read back as 256. The 512 and 1024 PNGs stay in the set for everything that is not
// an .ico, and out of this list.

export const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256]

export function buildIco(frames) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: 1 = icon
  header.writeUInt16LE(frames.length, 4)

  let offset = header.length + frames.length * 16
  const entries = frames.map(({ size, png }) => {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size === 256 ? 0 : size, 0) // width
    entry.writeUInt8(size === 256 ? 0 : size, 1) // height
    entry.writeUInt8(0, 2) // palette: none
    entry.writeUInt8(0, 3) // reserved
    entry.writeUInt16LE(1, 4) // planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += png.length
    return entry
  })

  return Buffer.concat([header, ...entries, ...frames.map((frame) => frame.png)])
}
