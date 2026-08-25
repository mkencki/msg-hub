import { describe, test, expect } from 'vitest'
import { UnreadLatch, HOLD_MS } from '../src/main/unread.js'

// The clock is a parameter here rather than a mocked global: every rule this class has is
// about elapsed time, and a test that had to wait three seconds to state one of them would
// be a test nobody runs.
describe('UnreadLatch', () => {
  const latch = () => new UnreadLatch({ hold: 3000 })

  test('a count that goes up is news, and news waits for nothing', () => {
    const unread = latch()
    unread.report('acc-one', 3, 1000)
    expect(unread.value('acc-one', 1000)).toBe(3)
  })

  // The blink: "(3) WhatsApp" for a second, "WhatsApp" for the next, over and over.
  test('a zero between two blinks changes nothing', () => {
    const unread = latch()
    unread.report('acc-one', 3, 1000)
    unread.report('acc-one', 0, 2000)
    expect(unread.value('acc-one', 2000)).toBe(3)
    unread.report('acc-one', 3, 3000)
    expect(unread.value('acc-one', 3000)).toBe(3)
  })

  test('a zero that lasts is believed once the hold is up', () => {
    const unread = latch()
    unread.report('acc-one', 3, 1000)
    unread.report('acc-one', 0, 2000)
    expect(unread.value('acc-one', 4999)).toBe(3)
    expect(unread.value('acc-one', 5000)).toBe(0)
  })

  // Every blink restarting the clock would hold the badge for the whole length of the blinking
  // AFTER the conversation was read, which is the bug wearing different clothes.
  test('only the first zero of a run starts the clock', () => {
    const unread = latch()
    unread.report('acc-one', 3, 1000)
    unread.report('acc-one', 0, 2000)
    unread.report('acc-one', 0, 2500)
    unread.report('acc-one', 0, 4000)
    expect(unread.value('acc-one', 5000)).toBe(0)
  })

  test('a count that changes without passing through zero is shown at once', () => {
    const unread = latch()
    unread.report('acc-one', 3, 1000)
    unread.report('acc-one', 1, 1500)
    expect(unread.value('acc-one', 1500)).toBe(1)
  })

  test('an account that was never anything but zero stays zero', () => {
    const unread = latch()
    unread.report('acc-one', 0, 1000)
    expect(unread.value('acc-one', 1000)).toBe(0)
    expect(unread.dueAt()).toBeNull()
  })

  test('an account nobody has reported on is zero, not undefined', () => {
    expect(latch().value('acc-nobody', 1000)).toBe(0)
  })

  // The badge is recomputed when a title changes, and a page that has gone quiet produces no
  // title changes at all. Without this the held zero would never be let through.
  test('says when a held zero falls due', () => {
    const unread = latch()
    expect(unread.dueAt()).toBeNull()
    unread.report('acc-one', 3, 1000)
    expect(unread.dueAt()).toBeNull()
    unread.report('acc-one', 0, 2000)
    expect(unread.dueAt()).toBe(5000)
  })

  test('the earliest of several held zeros is the one that falls due', () => {
    const unread = latch()
    unread.report('acc-one', 3, 1000)
    unread.report('acc-two', 2, 1000)
    unread.report('acc-two', 0, 1500)
    unread.report('acc-one', 0, 2000)
    expect(unread.dueAt()).toBe(4500)
  })

  test('a zero that has been let through is no longer due', () => {
    const unread = latch()
    unread.report('acc-one', 3, 1000)
    unread.report('acc-one', 0, 2000)
    expect(unread.value('acc-one', 5000)).toBe(0)
    expect(unread.dueAt()).toBeNull()
  })

  test('a count that comes back cancels the hold', () => {
    const unread = latch()
    unread.report('acc-one', 3, 1000)
    unread.report('acc-one', 0, 2000)
    unread.report('acc-one', 5, 2500)
    expect(unread.dueAt()).toBeNull()
    expect(unread.value('acc-one', 9000)).toBe(5)
  })

  // Removing an account must take its count with it, or the badge keeps counting a channel
  // that is not in the rail any more.
  test('an account that goes away takes its held count with it', () => {
    const unread = latch()
    unread.report('acc-one', 3, 1000)
    unread.report('acc-one', 0, 2000)
    unread.forget('acc-one')
    expect(unread.value('acc-one', 2000)).toBe(0)
    expect(unread.dueAt()).toBeNull()
  })

  test('accounts do not borrow each other counts', () => {
    const unread = latch()
    unread.report('acc-one', 3, 1000)
    unread.report('acc-two', 0, 1000)
    expect(unread.value('acc-two', 1000)).toBe(0)
    expect(unread.value('acc-one', 1000)).toBe(3)
  })

  // Three times the ~1 s blink of a real page, so one lost title event still cannot let a
  // blink through, and the operator waits at most three seconds for a read channel to clear.
  test('the default hold is three seconds', () => {
    expect(HOLD_MS).toBe(3000)
    const unread = new UnreadLatch()
    unread.report('acc-one', 2, 0)
    unread.report('acc-one', 0, 0)
    expect(unread.value('acc-one', 2999)).toBe(2)
    expect(unread.value('acc-one', 3000)).toBe(0)
  })
})
