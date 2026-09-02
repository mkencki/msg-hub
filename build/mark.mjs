// The mark, drawn rather than imported. It is four rounded rectangles – three account modules
// inside one tile, the active one amber – so the artwork is a handful of numbers and a
// rasteriser, and every derived file comes from the same source instead of from a copy of a
// copy. The geometry is the one in design/isolated-m.svg, on the same 256 unit canvas.
//
// The rasteriser needs nothing installed: sixteen samples per pixel, averaged, which is what
// gives the corners their edge.

const CANVAS = 256
const SAMPLES_PER_AXIS = 4

export const COLORS = {
  shell: '#151A20',
  inactive: '#E4E8EC',
  active: '#D9822B',
  // The sidebar sits a shade under the tile, so the tile reads as a tile and not as a bleed.
  field: '#0E1216',
  // MUI paints the header bar itself white; a dark field there would look glued on.
  bar: '#FFFFFF',
}

const SHAPES = [
  { x: 8, y: 8, width: 240, height: 240, radius: 52, color: COLORS.shell },
  { x: 54, y: 72, width: 40, height: 112, radius: 20, color: COLORS.inactive },
  { x: 108, y: 72, width: 40, height: 112, radius: 20, color: COLORS.inactive },
  { x: 162, y: 72, width: 40, height: 112, radius: 20, color: COLORS.active },
]

function rgbOf(hex) {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ]
}

const RASTER = SHAPES.map((shape) => ({ ...shape, rgb: rgbOf(shape.color) }))

function contains(shape, x, y) {
  if (x < shape.x || x > shape.x + shape.width || y < shape.y || y > shape.y + shape.height) {
    return false
  }

  const nearestX = Math.max(shape.x + shape.radius, Math.min(x, shape.x + shape.width - shape.radius))
  const nearestY = Math.max(shape.y + shape.radius, Math.min(y, shape.y + shape.height - shape.radius))
  const dx = x - nearestX
  const dy = y - nearestY
  return dx * dx + dy * dy <= shape.radius * shape.radius
}

function colorAt(x, y) {
  for (let index = RASTER.length - 1; index >= 0; index -= 1) {
    if (contains(RASTER[index], x, y)) return RASTER[index].rgb
  }
  return null
}

// The mark at a given edge length, as RGBA: colour where it covers, transparent where it does
// not, and a coverage-weighted alpha along every curve.
export function renderMark(size) {
  const rgba = Buffer.alloc(size * size * 4)
  const total = SAMPLES_PER_AXIS * SAMPLES_PER_AXIS

  for (let pixelY = 0; pixelY < size; pixelY += 1) {
    for (let pixelX = 0; pixelX < size; pixelX += 1) {
      const sum = [0, 0, 0]
      let covered = 0

      for (let sampleY = 0; sampleY < SAMPLES_PER_AXIS; sampleY += 1) {
        for (let sampleX = 0; sampleX < SAMPLES_PER_AXIS; sampleX += 1) {
          const x = ((pixelX + (sampleX + 0.5) / SAMPLES_PER_AXIS) * CANVAS) / size
          const y = ((pixelY + (sampleY + 0.5) / SAMPLES_PER_AXIS) * CANVAS) / size
          const color = colorAt(x, y)
          if (!color) continue

          sum[0] += color[0]
          sum[1] += color[1]
          sum[2] += color[2]
          covered += 1
        }
      }

      if (covered === 0) continue
      const offset = (pixelY * size + pixelX) * 4
      rgba[offset] = Math.round(sum[0] / covered)
      rgba[offset + 1] = Math.round(sum[1] / covered)
      rgba[offset + 2] = Math.round(sum[2] / covered)
      rgba[offset + 3] = Math.round((255 * covered) / total)
    }
  }

  return rgba
}

// A bitmap has no alpha channel, so everything is composited onto an opaque field here and
// leaves as plain RGB, top row first.
function field(width, height, hex) {
  const [r, g, b] = rgbOf(hex)
  const rgb = Buffer.alloc(width * height * 3)
  for (let offset = 0; offset < rgb.length; offset += 3) {
    rgb[offset] = r
    rgb[offset + 1] = g
    rgb[offset + 2] = b
  }
  return rgb
}

function fillRect(rgb, width, x, y, boxWidth, boxHeight, hex) {
  const [r, g, b] = rgbOf(hex)
  for (let row = y; row < y + boxHeight; row += 1) {
    for (let column = x; column < x + boxWidth; column += 1) {
      const offset = (row * width + column) * 3
      rgb[offset] = r
      rgb[offset + 1] = g
      rgb[offset + 2] = b
    }
  }
}

function blit(rgb, width, mark, size, atX, atY) {
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const source = (y * size + x) * 4
      const alpha = mark[source + 3]
      if (alpha === 0) continue

      const target = ((atY + y) * width + atX + x) * 3
      for (let channel = 0; channel < 3; channel += 1) {
        const over = mark[source + channel]
        const under = rgb[target + channel]
        rgb[target + channel] = Math.round((over * alpha + under * (255 - alpha)) / 255)
      }
    }
  }
}

// 164 by 314 is what MUI draws MUI_WELCOMEFINISHPAGE_BITMAP at, on the welcome and finish
// pages of both the installer and the uninstaller. No wordmark on it: the page already prints
// the application name in its own heading beside this strip, and letterforms built out of
// rectangles would be the one crude thing on an otherwise flat mark.
export function renderSidebar() {
  const width = 164
  const height = 314
  const size = 120
  const rgb = field(width, height, COLORS.field)

  blit(rgb, width, renderMark(size), size, (width - size) / 2, 64)
  // The page beside the strip is white. The rule gives the two a seam instead of a collision.
  fillRect(rgb, width, width - 3, 0, 3, height, COLORS.active)

  return { width, height, rgb }
}

// 150 by 57, right-aligned by MUI_HEADERIMAGE_RIGHT, on every page after the welcome one.
export function renderHeader() {
  const width = 150
  const height = 57
  const size = 44
  const rgb = field(width, height, COLORS.bar)

  blit(rgb, width, renderMark(size), size, width - size - 7, Math.round((height - size) / 2))

  return { width, height, rgb }
}
