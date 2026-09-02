// The files the shell loads by path. They live here rather than as constants inside main.js
// for one reason: main.js cannot be imported without a running Electron main process, so
// nothing could check that these paths lead anywhere.
//
// And nothing did. Both failures are SILENT: Electron ignores a window icon it cannot load,
// and `new Tray()` given an empty image produces a tray icon that is simply invisible –
// no exception, no warning. Measured 2026-08-25 by pointing both constants at files that do
// not exist: 215 unit tests and 7 end-to-end tests stayed green. tests/assets.test.js is the
// test that mutation now fails.
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const icons = (name) => path.join(HERE, '..', 'renderer', 'icons', name)

// An .ico rather than a PNG on purpose: Windows draws the window icon at 16, 24 or 32 pixels
// depending on where it appears, and the shell scaling one 256 px bitmap down is visibly worse
// than a frame drawn for that size.
export const WINDOW_ICON = icons('app.ico')

// The tray takes the 32 and halves it – an exact division, unlike 256 into 16.
export const TRAY_ICON = icons('icon-32.png')
