import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

const defaultRun = promisify(execFile)

export const DONE_MARKER = '@@MSGHUB-DONE@@'
const TIMEOUT_MS = 10000

// Set-Clipboard -LiteralPath exists ONLY in Windows PowerShell 5.1.
// PowerShell 7 (pwsh) has no such parameter — hence the explicit powershell.exe.
// Verified empirically during spec stage 0 (2026-08-23).
export function quotePS(text) {
  return `'${String(text).replace(/'/g, "''")}'`
}

export function buildCommand(filePath) {
  return {
    file: 'powershell.exe',
    args: ['-NoProfile', '-STA', '-Command', `Set-Clipboard -LiteralPath ${quotePS(filePath)}`],
  }
}

// The one-shot route: a new process per call. Kept as the fallback for when the
// long-lived session dies. Measured cost: median 668 ms (2026-08-23).
export async function setClipboardFile(filePath, run = defaultRun) {
  if (!filePath) return
  const { file, args } = buildCommand(filePath)
  await run(file, args, { windowsHide: true })
}

export function buildSessionCommand(filePath) {
  return (
    `try { Set-Clipboard -LiteralPath ${quotePS(filePath)} -ErrorAction Stop } ` +
    `catch { Write-Output ('ERROR ' + $_.Exception.Message) }; Write-Output '${DONE_MARKER}'\n`
  )
}

// The long-lived session: ONE PowerShell process for the whole run of the app, fed
// commands through stdin. Startup costs ~860 ms, but each later insertion takes a
// median of 15 ms instead of 668 ms. The spec (section 4.4) allowed a native module
// above a 500 ms threshold — this route drops below it without a new dependency.
export function createClipboardSession(spawnProcess = spawn) {
  let child = null

  const ensureProcess = () => {
    if (child && child.exitCode === null && !child.killed) return child
    child = spawnProcess(
      'powershell.exe',
      ['-NoProfile', '-STA', '-NonInteractive', '-Command', '-'],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
    )
    child.stdout.setEncoding('utf8')
    child.on('error', () => {
      child = null
    })
    return child
  }

  return {
    // Starting the process costs ~860 ms. Warming it up at application start means
    // the operator does not pay that on the first attachment.
    warmUp() {
      ensureProcess()
    },

    async setFile(filePath) {
      if (!filePath) return
      const current = ensureProcess()

      const answer = new Promise((resolve, reject) => {
        let buffer = ''
        const timer = setTimeout(() => {
          current.stdout.off('data', onData)
          reject(new Error('PowerShell did not answer within the expected time'))
        }, TIMEOUT_MS)

        function onData(chunk) {
          buffer += chunk
          if (!buffer.includes(DONE_MARKER)) return
          clearTimeout(timer)
          current.stdout.off('data', onData)
          const before = buffer.slice(0, buffer.indexOf(DONE_MARKER)).trim()
          if (before.startsWith('ERROR')) reject(new Error(before.slice(6)))
          else resolve()
        }

        current.stdout.on('data', onData)
      })

      current.stdin.write(buildSessionCommand(filePath))
      await answer
    },

    close() {
      child?.stdin?.end()
      child = null
    },
  }
}
