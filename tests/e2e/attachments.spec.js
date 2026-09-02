import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import path from 'node:path'

const run = promisify(execFile)

// The test generates its own material. It used to reach for files on the author's private
// drive, which meant it passed on exactly one machine – on a CI runner it ended in ENOENT,
// and in a public repository it would have given away someone else's directory structure.
//
// For this test the file's content does not matter: CF_HDROP carries the PATH, not bytes.
// The files are nevertheless real, minimal documents of their format – a file named .pdf
// that is not a PDF would be a trap for whoever later adds type validation here.
const SAMPLE_PDF = Buffer.from(
  `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Resources<<>>>>endobj
trailer<</Size 4/Root 1 0 R>>
%%EOF
`,
  'latin1',
)

const SAMPLE_MP4 = Buffer.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70,
  0x6d, 0x70, 0x34, 0x32, 0x00, 0x00, 0x00, 0x00,
  0x6d, 0x70, 0x34, 0x32, 0x69, 0x73, 0x6f, 0x6d,
  0x00, 0x00, 0x00, 0x08, 0x6d, 0x64, 0x61, 0x74,
])

const MATERIALS = [
  { type: 'PDF', name: 'installation manual.pdf', bytes: SAMPLE_PDF },
  { type: 'mp4', name: 'video guide.mp4', bytes: SAMPLE_MP4 },
]

let dataDir
let electronApp
let page

// Reading the ARTEFACT: what actually sits on the Windows clipboard. An exit code is not
// enough – Set-Clipboard can report success and leave the clipboard empty.
async function filesOnClipboard() {
  const { stdout } = await run(
    'powershell.exe',
    [
      '-NoProfile',
      '-STA',
      '-Command',
      '$l = Get-Clipboard -Format FileDropList; if ($l) { $l | ForEach-Object { $_.Name } }',
    ],
    { windowsHide: true },
  )
  return stdout.trim().split('\n').map((w) => w.trim()).filter(Boolean)
}

test.beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'mhub-attachments-'))
  electronApp = await electron.launch({ args: ['.', `--user-data-dir=${dataDir}`] })
  page = await electronApp.firstWindow()
  await page.waitForSelector('body[data-ready="1"]')

  // The account is created through the form – with no active view there is nowhere to insert.
  await page.locator('#add-account').click()
  await page.locator('#account-dialog input[name="name"]').fill('WhatsApp test')
  await page.locator('#save-account').click()
  await expect(page.locator('.channel')).toHaveCount(1)
})

test.afterEach(async () => {
  // The clipboard holds a handle to the pasted file – without clearing it the temp
  // directory stays locked and the next test waits for it to be released.
  await electronApp.evaluate(({ clipboard }) => clipboard.clear()).catch(() => {})
  await electronApp.close()
  const cleanup = rm(dataDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  await Promise.race([cleanup, new Promise((done) => setTimeout(done, 3000))])
})

for (const material of MATERIALS) {
  test(`a macro with a ${material.type} attachment puts the file on the Windows clipboard as CF_HDROP`, async () => {
    const att = path.join(dataDir, 'att')
    await mkdir(att, { recursive: true })
    const storedName = `11111111-2222-3333-4444-555555555555-${material.name}`
    await writeFile(path.join(att, storedName), material.bytes)

    await page.evaluate(
      (relative) =>
        window.mHub.saveMacro({
          name: 'Passango installation',
          text: '*Installation manual:*',
          attachments: [relative],
        }),
      `att/${storedName}`,
    )

    // The clipboard deliberately starts on something else, so the result cannot be a fluke.
    await electronApp.evaluate(({ clipboard }) => clipboard.writeText('whatever was on the clipboard before'))

    const result = await page.evaluate(async () => {
      const macros = await window.mHub.listMacros('')
      return window.mHub.insertMacro(macros[0].id)
    })

    expect(result.ok).toBe(true)
    expect(result.missing).toEqual([])
    // The file lands on the clipboard AFTER the text – a macro inserts content first,
    // then the attachment.
    expect(await filesOnClipboard()).toEqual([storedName])
  })
}

test('a file missing from the store does not sink the macro: the text works and the gap is reported', async () => {
  await page.evaluate(() =>
    window.mHub.saveMacro({
      name: 'Macro with an orphaned attachment',
      text: '*The text works even with the file gone*',
      attachments: ['att/no-such-file.pdf'],
    }),
  )

  await electronApp.evaluate(({ clipboard }) => clipboard.writeText('whatever was on the clipboard before'))

  const result = await page.evaluate(async () => {
    const macros = await window.mHub.listMacros('')
    return window.mHub.insertMacro(macros[0].id)
  })

  expect(result.ok).toBe(false)
  expect(result.missing).toEqual(['att/no-such-file.pdf'])

  // The text reached the clipboard even so – spec section 8.
  const onClipboard = await electronApp.evaluate(({ clipboard }) => clipboard.readText())
  expect(onClipboard).toBe('*The text works even with the file gone*')
})
