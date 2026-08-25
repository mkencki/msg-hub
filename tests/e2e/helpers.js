// Shared preconditions. Everything here exists because a test assumed a starting state
// instead of establishing one, and then failed for a reason that had nothing to do with what
// it was testing.

// The status bar can already be carrying something the application said at startup — most
// often that another program owns the global macro shortcut, which is a system-wide exclusive
// and, during a full suite run, is sometimes still held by the previous spec's application on
// its way out. A test about a message raised by the action under test has to start from an
// empty bar, and the bar is emptied the way the operator would empty it.
export async function clearStatusBar(page) {
  const bar = page.locator('#message')
  if (await bar.isVisible()) await page.locator('#dismiss-message').click()
  await bar.waitFor({ state: 'hidden' })
}
