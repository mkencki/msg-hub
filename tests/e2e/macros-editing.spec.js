import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm, mkdir, writeFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

let dataDir
let electronApp
let page

test.beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'msghub-macros-editing-'))
  electronApp = await electron.launch({ args: ['.', `--user-data-dir=${dataDir}`] })
  page = await electronApp.firstWindow()
  await page.waitForSelector('body[data-ready="1"]')
})

test.afterEach(async () => {
  await electronApp.close()
  const cleanup = rm(dataDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([cleanup, new Promise((done) => setTimeout(done, 3000))])
})

async function addMacro(name, text, attachments = []) {
  await page.evaluate(
    (macro) => window.msgHub.saveMacro(macro),
    { name, text, attachments },
  )
}

// The attachment is placed straight into the store — the file picker is a native dialog
// and cannot be clicked through from a test.
async function putInStore(fileName) {
  const att = path.join(dataDir, 'att')
  await mkdir(att, { recursive: true })
  const storedName = `11111111-2222-3333-4444-555555555555-${fileName}`
  await writeFile(path.join(att, storedName), 'test content')
  return `att/${storedName}`
}

test('Edit opens the editor filled with the existing content', async () => {
  await addMacro('Client Zone manual', '*How to add a driver:*')

  await page.keyboard.press('Control+Semicolon')
  await page.locator('#macro-list li .edit-macro').click()

  await expect(page.locator('#editor-dialog')).toBeVisible()
  await expect(page.locator('#editor-name')).toHaveValue('Client Zone manual')
  await expect(page.locator('#editor-text')).toHaveValue('*How to add a driver:*')
})

test('saving after an edit overwrites the macro instead of creating a second one', async () => {
  await addMacro('Client Zone manual', 'old content')

  await page.keyboard.press('Control+Semicolon')
  await page.locator('#macro-list li .edit-macro').click()
  await page.locator('#editor-text').fill('new content')
  await page.locator('#save-macro').click()
  // The save is asynchronous, and reading right after the click raced it: locally the save
  // won, on the slower CI runner the read did, and the test saw the old content. The editor
  // closes ONLY after a successful save, so that is the end-of-operation signal.
  await expect(page.locator('#editor-dialog')).toBeHidden()

  const macros = await page.evaluate(() => window.msgHub.listMacros(''))
  expect(macros).toHaveLength(1)
  expect(macros[0].text).toBe('new content')
})

test('editing does not throw the macro to the end of the list', async () => {
  await addMacro('Alfa', 'a')
  await addMacro('Beta', 'b')
  await addMacro('Gamma', 'c')

  await page.keyboard.press('Control+Semicolon')
  await page.locator('#macro-list li', { hasText: 'Beta' }).locator('.edit-macro').click()
  await page.locator('#editor-text').fill('b corrected')
  await page.locator('#save-macro').click()
  // The save is asynchronous, and reading right after the click raced it: locally the save
  // won, on the slower CI runner the read did, and the test saw the old content. The editor
  // closes ONLY after a successful save, so that is the end-of-operation signal.
  await expect(page.locator('#editor-dialog')).toBeHidden()

  const macros = await page.evaluate(() => window.msgHub.listMacros(''))
  expect(macros.map((m) => m.name)).toEqual(['Alfa', 'Beta', 'Gamma'])
})

test('a cancelled removal leaves the macro on the list', async () => {
  await addMacro('Client Zone manual', 'content')

  await page.keyboard.press('Control+Semicolon')
  await page.locator('#macro-list li .remove-macro').click()
  await expect(page.locator('#remove-macro-dialog')).toBeVisible()
  await page.locator('#cancel-remove-macro').click()

  await expect(page.locator('#macro-list li')).toHaveCount(1)
  expect(await page.evaluate(() => window.msgHub.listMacros(''))).toHaveLength(1)
})

test('a confirmed removal takes the macro away and deletes its attachment from the store', async () => {
  const relative = await putInStore('PASSango - manual.mp4')
  await addMacro('Passango installation', 'content', [relative])

  await page.keyboard.press('Control+Semicolon')
  await page.locator('#macro-list li .remove-macro').click()
  await page.locator('#confirm-remove-macro').click()

  await expect(page.locator('#macro-list .empty')).toHaveText(/No macros/)
  expect(await page.evaluate(() => window.msgHub.listMacros(''))).toHaveLength(0)

  // Without sweeping the store, a 4 MB file would sit on disk forever.
  expect(await readdir(path.join(dataDir, 'att'))).toEqual([])
})

test('an attachment can be detached from a macro in the editor', async () => {
  const relative = await putInStore('PASSango - manual.mp4')
  await addMacro('Passango installation', 'content', [relative])

  await page.keyboard.press('Control+Semicolon')
  await page.locator('#macro-list li .edit-macro').click()
  await expect(page.locator('#attachment-list .detach-attachment')).toHaveCount(1)

  await page.locator('#attachment-list li .detach-attachment').click()
  await page.locator('#save-macro').click()
  // The save is asynchronous, and reading right after the click raced it: locally the save
  // won, on the slower CI runner the read did, and the test saw the old content. The editor
  // closes ONLY after a successful save, so that is the end-of-operation signal.
  await expect(page.locator('#editor-dialog')).toBeHidden()

  const macros = await page.evaluate(() => window.msgHub.listMacros(''))
  expect(macros[0].attachments).toEqual([])
  expect(await readdir(path.join(dataDir, 'att'))).toEqual([])
})
