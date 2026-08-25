// Rebuilds the derived icon files from the PNG set in src/renderer/icons, which is the one
// place the artwork lives. Run after changing it:  npm run icon
//
// The set sits under src/ and not here because package.json packs "src/**/*" and nothing else:
// an icon kept in build/ reaches the installer and never reaches the installed application,
// which would leave the window without one.
import { readFile, writeFile, copyFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildIco, ICO_SIZES } from './ico.mjs'

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

console.log(`icon: ${ICO_SIZES.length} frames, ${ico.length} bytes`)
