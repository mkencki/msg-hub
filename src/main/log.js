import { appendFile, mkdir, rename, stat } from 'node:fs/promises'
import path from 'node:path'

// The whole point of this file is that it can be sent to somebody. Someone helping a friend
// with an app that will not sign in needs to know what went wrong; they have no business
// learning who that friend talks to. So the rule is not "avoid logging content", which is a
// promise, but "write only the fields named here", which is a mechanism.
//
// Page titles are deliberately absent even though they are the least obviously sensitive
// thing here: they are exactly where the unread counts come from, and they carry the names
// of the people in the conversation.
export const LOGGED_FIELDS = ['account', 'platform', 'code', 'reason', 'count', 'ms']

const MAX_VALUE = 120
const DEFAULT_MAX_BYTES = 512 * 1024

function render(fields) {
  return LOGGED_FIELDS.filter((name) => fields?.[name] !== undefined && fields[name] !== null)
    .map((name) => {
      // One event is one line: a value carrying a newline would otherwise split in two and
      // the second half would read as an event of its own.
      const value = String(fields[name]).replace(/[\r\n\t]+/g, ' ').slice(0, MAX_VALUE)
      return `${name}=${value}`
    })
    .join(' ')
}

export function createLogger(dir, { maxBytes = DEFAULT_MAX_BYTES, create = true, now = () => new Date() } = {}) {
  const file = path.join(dir, 'm-hub.log')
  const previous = path.join(dir, 'm-hub.1.log')
  let ready = null

  const ensureDir = () => {
    if (!create) return Promise.resolve()
    ready ??= mkdir(dir, { recursive: true })
    return ready
  }

  // Two files is a ceiling, not a policy: the older one is replaced rather than kept
  // alongside, so a log left running for a year cannot quietly fill a disk.
  const rotateIfFull = async () => {
    const { size } = await stat(file).catch(() => ({ size: 0 }))
    if (size < maxBytes) return
    await rename(file, previous).catch(() => {})
  }

  return {
    file,
    // Failing to write a log must never be the reason the application stops working, so
    // every path here ends in a swallowed error rather than a rejection.
    async write(event, fields = {}) {
      try {
        await ensureDir()
        await rotateIfFull()
        const rendered = render(fields)
        await appendFile(file, `${now().toISOString()} ${event}${rendered ? ' ' + rendered : ''}\n`, 'utf8')
      } catch {
        // Nothing to do about it and nowhere to say so – this IS the place things get said.
      }
    },
  }
}
