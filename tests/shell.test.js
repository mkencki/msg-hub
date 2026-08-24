import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { loadLayout, saveLayout, DEFAULT_LAYOUT } from '../src/main/shell.js'

let file, dir

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'msghub-layout-'))
  file = path.join(dir, 'layout.json')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('the window layout', () => {
  test('a missing file yields the default layout', async () => {
    expect(await loadLayout(file)).toEqual(DEFAULT_LAYOUT)
  })

  // Language is a preference rather than geometry, but it lives in the same settings
  // file — otherwise the first launch after installation would have to read two.
  test('the default language after installation is English', async () => {
    expect(DEFAULT_LAYOUT.language).toBe('en')
    expect((await loadLayout(file)).language).toBe('en')
  })

  test('a saved language survives a restart', async () => {
    await saveLayout(file, { ...DEFAULT_LAYOUT, language: 'pl' })
    expect((await loadLayout(file)).language).toBe('pl')
  })

  test('a damaged language value does not sink the start', async () => {
    await writeFile(file, JSON.stringify({ ...DEFAULT_LAYOUT, language: { zly: 'ksztalt' } }), 'utf8')
    expect(typeof (await loadLayout(file)).language).toBe('string')
  })

  // Version 1 kept this file under a Polish name. Reading the old one keeps the window
  // position across the upgrade, but leaving it behind would be worse than untidy: it is a
  // stale copy that would silently come back to life if the new file were ever lost.
  test('saving under the new name discards the legacy file it superseded', async () => {
    const legacy = path.join(dir, 'uklad.json')
    await writeFile(legacy, JSON.stringify({ szerokosc: 999, jezyk: 'pl' }), 'utf8')

    await saveLayout(file, { ...DEFAULT_LAYOUT }, legacy)

    expect(existsSync(legacy)).toBe(false)
    expect(existsSync(file)).toBe(true)
  })

  test('a legacy file that is already gone is not an error', async () => {
    await expect(saveLayout(file, { ...DEFAULT_LAYOUT }, path.join(dir, 'nie-ma.json'))).resolves.toBeUndefined()
  })

  test('the layout survives a save and a read', async () => {
    await saveLayout(file, { x: 100, y: 50, width: 1000, height: 700, maximized: false })
    const result = await loadLayout(file)
    expect(result.width).toBe(1000)
    expect(result.x).toBe(100)
  })

  test('a damaged file yields the default layout instead of an exception', async () => {
    await writeFile(file, 'nie-json', 'utf8')
    expect(await loadLayout(file)).toEqual(DEFAULT_LAYOUT)
  })

  test('absurd sizes are clamped to the minimum', async () => {
    await saveLayout(file, { width: 10, height: 10, maximized: false })
    const result = await loadLayout(file)
    expect(result.width).toBeGreaterThanOrEqual(800)
    expect(result.height).toBeGreaterThanOrEqual(600)
  })
})

describe('the pinned rail inside the layout', () => {
  test('a missing file leaves the rail unpinned, that is, collapsible', async () => {
    expect((await loadLayout(file)).railPinned).toBe(false)
  })

  test('a saved pin comes back on read', async () => {
    await saveLayout(file, { ...DEFAULT_LAYOUT, railPinned: true })

    expect((await loadLayout(file)).railPinned).toBe(true)
  })

  test('garbage in the field does not leak into state, a boolean always comes out', async () => {
    await saveLayout(file, { ...DEFAULT_LAYOUT, railPinned: 'tak' })

    expect((await loadLayout(file)).railPinned).toBe(true)
  })
})
