import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

let dataDir
let electronApp
let page

test.beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'mhub-tags-'))
  electronApp = await electron.launch({ args: ['.', `--user-data-dir=${dataDir}`] })
  page = await electronApp.firstWindow()
  await page.waitForSelector('body[data-ready="1"]')
})

test.afterEach(async () => {
  await electronApp.close().catch(() => {})
  const cleanup = rm(dataDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([cleanup, new Promise((done) => setTimeout(done, 3000))])
})

const openPalette = async () => {
  await page.locator('#open-macros').click()
  await expect(page.locator('#macros-dialog')).toBeVisible()
}

// The model has carried tags since stage 2 and search has always read them, and the search
// box says so in as many words — "Search by name, content or tag". No screen ever set one.
test('a macro can be given tags, and they come back to be edited', async () => {
  await openPalette()
  await page.locator('#new-macro').click()
  await page.locator('#editor-name').fill('Client Zone manual')
  await page.locator('#editor-text').fill('Here is the guide')
  await page.locator('#editor-tags').fill('Zone, guide,  , zone')
  await page.locator('#save-macro').click()
  await expect(page.locator('#editor-dialog')).toBeHidden()

  const stored = await page.evaluate(() => window.mHub.listMacros(''))
  expect(stored[0].tags).toEqual(['zone', 'guide'])

  await openPalette()
  await page.locator('#macro-list li .edit-macro').click()
  await expect(page.locator('#editor-tags')).toHaveValue('zone, guide')
})

test('a tag makes the macro findable by it', async () => {
  await page.evaluate(() =>
    window.mHub.saveMacro({ name: 'Client Zone manual', text: 'guide', tags: ['zone'] }),
  )
  await page.evaluate(() => window.mHub.saveMacro({ name: 'Offer', text: 'prices' }))

  await openPalette()
  await page.locator('#macro-search').fill('zone')

  await expect(page.locator('#macro-list li')).toHaveCount(1)
})

// A tag nobody can see is a tag nobody uses. Showing them on the row also makes the filter
// discoverable without a word of explanation.
test('tags are shown on the row and filter when clicked', async () => {
  await page.evaluate(() =>
    window.mHub.saveMacro({ name: 'Client Zone manual', text: 'guide', tags: ['zone', 'guide'] }),
  )
  await page.evaluate(() => window.mHub.saveMacro({ name: 'Offer', text: 'prices', tags: ['sales'] }))

  await openPalette()
  await expect(page.locator('#macro-list li')).toHaveCount(2)
  await expect(page.locator('#macro-list .macro-tag')).toHaveCount(3)

  await page.locator('#macro-list .macro-tag', { hasText: 'sales' }).click()

  await expect(page.locator('#macro-search')).toHaveValue('sales')
  await expect(page.locator('#macro-list li')).toHaveCount(1)
  await expect(page.locator('#macro-list li')).toContainText('Offer')
})

// Clearing a field has to be possible; it just has to be asked for.
test('clearing the tags field clears the tags', async () => {
  await page.evaluate(() =>
    window.mHub.saveMacro({ name: 'Client Zone manual', text: 'guide', tags: ['zone'] }),
  )

  await openPalette()
  await page.locator('#macro-list li .edit-macro').click()
  await page.locator('#editor-tags').fill('')
  await page.locator('#save-macro').click()
  await expect(page.locator('#editor-dialog')).toBeHidden()

  const stored = await page.evaluate(() => window.mHub.listMacros(''))
  expect(stored[0].tags).toEqual([])
})
