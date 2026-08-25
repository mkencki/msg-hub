# Release notes

## 0.3.0 — staying alive, macros 2.0, whole services

**Accounts stay awake.** Chromium treats a view of zero height as a hidden tab and slows its
timers by an order of magnitude — measured here as 10 ticks of a 100 ms timer in ten seconds
against 101 while active. Every account but the current one is exactly that view, and once the
window goes to the tray so is the current one, which is the state this application exists to be
useful in. Background throttling is off.

**One copy, and a window that hides instead of dying.** A second launch reaches the window that
is already open rather than starting a rival over the same profile. The window button puts
msg-hub in the tray; Quit lives on the tray menu, and Settings has a switch for anyone who wants
the button to mean what it usually means. Autostart really starts hidden — Electron's
`openAsHidden` is documented as macOS-only, so the login item passes a flag instead.

**Keys.** `Ctrl+1..9` reaches a channel, `Ctrl+R` reloads the current account, `Ctrl+;` opens the
macro palette, and `Ctrl+Shift+Space` does it from anywhere. A global shortcut is a system-wide
exclusive: when another program already owns it, the status bar says so rather than the shortcut
quietly doing nothing.

**Clicking a notification lands on the account it came from** — the rail follows, instead of
leaving you in a conversation with the wrong channel highlighted.

**Links have a declared place to open.** Until now a link in a conversation opened a bare Electron
window: no address bar, no back, no reload, and inside the account's signed-in session. Every
address is now classified before it goes anywhere, and Meta's link shims — which make an outgoing
link look like a facebook.com address — are consulted before the host list.

**Recovery.** A stale or dead account can be reloaded without restarting the others. A crash, an
unresponsive view, or a laptop waking from sleep offers a reload on the status bar rather than
performing one: reloading throws away whatever is half-typed in a composer.

**A local log** the operator can read and safely send on: it records events and codes from a fixed
list of fields, never message content, and rotates to one older file.

**Macros 2.0.** Tags are in the interface, not only in the file format. A macro may carry
`{placeholders}`, and the application asks for them before the text goes anywhere — cancelling the
question leaves the clipboard exactly as it was. `{date}` and `{data}` fill themselves from the
clock. After an insertion the keyboard goes back into the account instead of staying with the
palette.

**LinkedIn and Facebook can be added as whole services.** LinkedIn is entered at `/feed/` on the
www host — the apex answers "Checking your browser - reCAPTCHA", measured twice. Notifications are
now controlled per account: messengers may interrupt out of the box, whole services stay quiet
until asked, and the account overrides its platform in either direction.

**Neither whole service shows an unread count.** `unreadFromTitle` reads "(99+)" correctly now — it
used to return zero, so the badge vanished exactly when an account was busiest — but LinkedIn's
number is the sum of eight badge sources, and Facebook's 2026 title format could not be confirmed
at all. A badge nobody has seen work would be a promise. Both are one word from being turned on,
and the reason sits on the entry in `src/main/accounts.js`.

### Going back a version deletes LinkedIn and Facebook accounts

A build older than 0.3.0 does not know those platforms. It drops such accounts out of
`accounts.json` while reading it, and writes the shortened list back on the next save — along with
their sign-ins, because a session partition is named after the account id. **This door only opens
one way.** Nothing else in this release is a one-way change.

### Installing

See `docs/installing.md`, attached below: this installer is not code-signed, and on a machine with
Smart App Control enabled it will be blocked no matter what you click. Running from source works
there and is the supported path.
