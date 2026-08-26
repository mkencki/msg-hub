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

// Puts every account view on a blank document, in an order Chromium cannot resolve the wrong
// way round.
//
// The obvious version — stop() the real page, then loadURL('about:blank') over it — is a
// RACE, and two specs already carried comments saying so and calling it fixed. It was not.
// Measured 2026-08-26 over six full suite runs: navigation.spec.js failed in FOUR of them,
// always the same way, with the real page landing on top of the replacement:
//
//     Expected: "about:blank"   Received: "https://www.messenger.com/"
//
// stop() cancels the load that is in flight. A navigation Chromium has already handed on to
// commit is no longer in flight, and nothing cancels that one — it arrives last and wins.
//
// So nothing is replaced while it is still moving. Waiting for the pending navigation to
// COMMIT (did-navigate) or give up (did-fail-load) leaves nothing that could still land, and
// the replacement is then the only navigation there is.
//
// The question and the subscription sit in the same synchronous block on purpose: the main
// process runs one thing at a time, so no navigation can commit between asking whether one is
// pending and asking to be told when it finishes. Split by an await, that gap is the same
// race again, one layer down.
export const blankTheViews = (electronApp) =>
  electronApp.evaluate(async ({ BrowserWindow }) => {
    // The question is whether the main frame has COMMITTED anything yet, and the answer is
    // the URL — not isLoadingMainFrame(). Measured 2026-08-26 on the two views of
    // notification-routing.spec.js: the second had already committed the real page and still
    // reported isLoadingMainFrame() true while it finished fetching what the page asked for.
    // No second did-navigate was ever coming, so waiting for one waited until the test timed
    // out. An empty URL is the only state where a first commit is still on its way.
    const committed = (webContents) => {
      if (webContents.getURL()) return Promise.resolve()
      return new Promise((landed) => {
        webContents.once('did-navigate', landed)
        webContents.once('did-fail-load', landed)
      })
    }

    for (const view of BrowserWindow.getAllWindows()[0].contentView.children) {
      await committed(view.webContents)
      // A rejection here is ERR_ABORTED and it is the point, not a problem: about:blank
      // aborts whatever the real page was still fetching. Its navigation has already landed,
      // so it cannot land again on top of this one.
      await view.webContents.loadURL('about:blank').catch(() => {})
    }
  })

