// Rebuilds every derived graphic in one go:  npm run icon
//
// Two sources, and neither is a copy of the other. The .ico frames come from the PNG set in
// src/renderer/icons, which is where the artwork for the running application lives. The two
// installer bitmaps are drawn from build/mark.mjs, because NSIS wants sizes nothing else uses
// and a format with no alpha channel to scale.
//
// The set sits under src/ and not here because package.json packs "src/**/*" and nothing else:
// an icon kept in build/ reaches the installer and never reaches the installed application,
// which would leave the window without one.
import { readFile, writeFile, copyFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildIco, ICO_SIZES } from './ico.mjs'
import { renderSidebar, renderHeader } from './mark.mjs'
import { encodeBmp } from './bmp.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const icons = (name) => path.join(ROOT, 'src', 'renderer', 'icons', name)

const frames = await Promise.all(
  ICO_SIZES.map(async (size) => ({ size, png: await readFile(icons(`icon-${size}.png`)) })),
)
const ico = buildIco(frames)

// One for the running application, one for electron-builder, both from the same bytes.
await writeFile(icons('app.ico'), ico)
await writeFile(path.join(ROOT, 'build', 'icon.ico'), ico)
await copyFile(icons('icon-256.png'), path.join(ROOT, 'build', 'icon.png'))

// The wizard graphics. electron-builder looks for exactly these two names under the
// buildResources directory and needs no configuration to find them; absent, NSIS falls back
// to its own blue nsis3-metro.bmp, which is what the installer wore until now.
const sidebar = renderSidebar()
const header = renderHeader()
await writeFile(path.join(ROOT, 'build', 'installerSidebar.bmp'), encodeBmp(sidebar))
await writeFile(path.join(ROOT, 'build', 'installerHeader.bmp'), encodeBmp(header))

console.log(`icon:    ${ICO_SIZES.length} frames, ${ico.length} bytes`)
console.log(`sidebar: ${sidebar.width}x${sidebar.height}`)
console.log(`header:  ${header.width}x${header.height}`)
