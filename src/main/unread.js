// A page with something waiting BLINKS its own title to catch the eye: messenger.com and
// web.whatsapp.com alternate between "(1) Messenger" and "Messenger" about once a second. Read
// literally, the title says one unread, then none, then one — and the taskbar overlay followed
// it exactly, appearing for a second and vanishing for the next. Measured 2026-08-25 against a
// page blinking four times a second: the window title took both values inside two seconds.
//
// The same behaviour is on record in docs/design.md section 9, where a title that blinks once
// a second is one of the reasons Telegram was left out.
//
// The rule below is one-sided on purpose. A count going UP is news and is shown at once; a
// count dropping to zero is believed only after it has stayed at zero for the hold. Reading
// the last conversation therefore clears the badge a moment later, and a blink never clears it
// at all. A symmetrical rule would delay every arriving message by the hold, which is the one
// thing this application exists to be quick about.

// Three times the blink of a real page: one lost title event still cannot let a blink through,
// and a channel that has genuinely been read clears within three seconds.
export const HOLD_MS = 3000

export class UnreadLatch {
  constructor({ hold = HOLD_MS } = {}) {
    this.hold = hold
    // accountId -> { shown, zeroSince }. zeroSince is null unless a zero is being held.
    this.state = new Map()
  }

  report(accountId, count, now) {
    if (count > 0) {
      this.state.set(accountId, { shown: count, zeroSince: null })
      return
    }
    const entry = this.state.get(accountId)
    if (!entry || entry.shown === 0) {
      this.state.set(accountId, { shown: 0, zeroSince: null })
      return
    }
    // Only the FIRST zero of a run starts the clock. Letting every blink push the deadline
    // forward would hold the badge for as long as the page keeps blinking — which is this
    // same bug wearing different clothes.
    if (entry.zeroSince === null) this.state.set(accountId, { ...entry, zeroSince: now })
  }

  value(accountId, now) {
    const entry = this.state.get(accountId)
    if (!entry) return 0
    if (entry.zeroSince !== null && now - entry.zeroSince >= this.hold) {
      this.state.set(accountId, { shown: 0, zeroSince: null })
      return 0
    }
    return entry.shown
  }

  forget(accountId) {
    this.state.delete(accountId)
  }

  // When the next held zero falls due, or null when nothing is being held. The badge is worked
  // out from title events, and a page that has gone quiet sends none — so something has to
  // come back on its own to let a held zero through.
  dueAt() {
    let due = null
    for (const { zeroSince } of this.state.values()) {
      if (zeroSince === null) continue
      const at = zeroSince + this.hold
      if (due === null || at < due) due = at
    }
    return due
  }
}
