import { readFile, writeFile, rename, unlink } from 'node:fs/promises'

export const DEFAULT_LAYOUT = {
  width: 1280,
  height: 800,
  maximized: false,
  // An unpinned rail collapses to icons and expands when the cursor enters it.
  railPinned: false,
  // English after installation — the app travels beyond one machine. The list of
  // languages and their validation live in src/renderer/i18n.js; only the stored
  // value lives here, so the main process does not drag the dictionaries with it.
  language: 'en',
}

const MIN_WIDTH = 800
const MIN_HEIGHT = 600

// Schema version 1 wrote these keys in Polish and kept them in uklad.json.
// Both spellings are accepted on read so an upgrade does not throw away the window
// position, the pinned rail or — most visibly — the chosen language.
export async function loadLayout(filePath) {
  try {
    const data = JSON.parse(await readFile(filePath, 'utf8'))
    const width = Number(data.width ?? data.szerokosc)
    const height = Number(data.height ?? data.wysokosc)
    return {
      ...data,
      x: data.x,
      y: data.y,
      width: Math.max(MIN_WIDTH, width || DEFAULT_LAYOUT.width),
      height: Math.max(MIN_HEIGHT, height || DEFAULT_LAYOUT.height),
      maximized: Boolean(data.maximized ?? data.zmaksymalizowane),
      railPinned: Boolean(data.railPinned ?? data.szynaPrzypieta),
      // A string and nothing else. Whether such a language exists is decided by the
      // renderer through validLanguage() — an object or a number out of a damaged
      // file must never reach the interface.
      language: typeof (data.language ?? data.jezyk) === 'string' ? (data.language ?? data.jezyk) : DEFAULT_LAYOUT.language,
    }
  } catch {
    return { ...DEFAULT_LAYOUT }
  }
}

// legacyPath is the version 1 file, which lived under a Polish name. It is removed only
// AFTER the new file is safely in place: leaving it behind would be worse than untidy,
// because it is a stale copy that would silently come back to life if the new file were
// ever lost. A legacy file that is already gone is not an error.
export async function saveLayout(filePath, layout, legacyPath = null) {
  await writeFile(filePath + '.tmp', JSON.stringify(layout, null, 2), 'utf8')
  await rename(filePath + '.tmp', filePath)
  if (legacyPath && legacyPath !== filePath) {
    await unlink(legacyPath).catch(() => {})
  }
}

export function setAutoStart(enabled, app) {
  app.setLoginItemSettings({ openAtLogin: Boolean(enabled), openAsHidden: true })
}
