# Release notes

## 0.5.3 – installing over an older copy is an update, and looks like one

**The installer stops asking questions.** It no longer offers a directory, and no longer asks
whether to install for you or for everybody: it installs under your own account, in
`%LOCALAPPDATA%\Programs\M-HUB`, and never raises a password prompt. One click, and it is done.

**Run it where M-HUB already lives and it updates that copy.** That was true before – NSIS
uninstalls the previous version and takes its place, leaving one entry in Settings and one
folder under Programs – but the wizard asked for an install mode and a directory on the way, so
an upgrade was indistinguishable from a first installation. With nothing to ask, there is
nothing to mistake. Your profile is untouched either way: accounts, macros, attachments and
signed-in sessions carry over.

The one thing lost is the choice of folder. It bought little – the per-user location is the
only one an installer can use without an administrator, which is how this application reaches
locked-down machines – and it cost a page that made every upgrade look like starting over.

## 0.5.2 – the window opens where you are looking

**The window no longer remembers where it was; it works out where it belongs.** A remembered
position is only true for the monitor arrangement it was written on, and arrangements change:
two external screens at the desk, the laptop's own screen on the train. Measured on
2026-09-01, a stored layout carrying `x=-1394 y=972` opened the window on no screen at all,
and a later start put it in the corner of a second monitor nobody was looking at. The
application was running and unreachable, which for a window amounts to not running.

M-HUB now opens centred on whichever monitor Windows currently treats as primary. The size it
opens at is trimmed to that monitor's work area first, because a window remembered from a
large external screen is wider than a laptop's, and centring something bigger than the screen
puts its title bar – and its close button – above the top edge.

The size and the maximised state are still remembered: a window closed maximised comes back
maximised, on whichever monitor is primary now. Only the position is gone from the layout
file, because a stored position is a fact nothing reads and everything outlives.

## 0.5.1 – the profile 0.5.0 left behind, and a Microsoft sign-in that arrives whole

**0.5.0 walked away from your setup. This version goes back for it.** Electron builds the
profile directory out of the application's name, so the rename moved it from `%APPDATA%\msg-hub`
to `%APPDATA%\M-HUB` and nothing carried the old one across: accounts, macros, attachments and
signed-in sessions all stayed on disk, in a directory the application had stopped reading. They
are moved on the first start of 0.5.1 – sessions included, so no account asks for a fresh QR
code.

It moves only what the new profile does not already have, and only when that profile has never
held accounts. So it cannot run twice, and it cannot bring back accounts anybody deleted on
purpose: removing every account writes an empty list rather than deleting the file. The accounts
file moves last, which is what lets an interrupted move finish by itself on the next start
instead of stranding the sessions.

**"Sign in with Microsoft" on LinkedIn stopped leaving the application.** It failed in the system
browser with `AADSTS900561: The endpoint only accepts POST requests. Received a GET request.`
The sign-in host list knew `login.microsoftonline.com`, which is where WORK accounts sign in; a
personal Microsoft account goes to `login.live.com`, and the passkey step after it to
`login.microsoft.com`. Neither was declared, so both were handed to the system browser – and
that is why the error was about a method rather than a window: opening an address externally can
only ever be a GET, while the sign-in asks for `response_mode=form_post`. An undeclared sign-in
host does not merely open in the wrong place, it arrives without its method and cannot work
anywhere. Both endpoints are now declared; the work-account one stays, because which is used
depends on the account.

## 0.5.0 – the name, and a wizard that looks like the application

The application is called **M-HUB**. Everything an operator sees carries the new name: the
window, the tray, the taskbar button, the installer and the shortcuts it writes.

**It does not carry a 0.4.0 setup over.** Electron derives the profile directory from the
application's name, so it moves from `%APPDATA%\msg-hub` to `%APPDATA%\M-HUB`, and nothing
migrates it. 0.5.0 starts with an empty profile: accounts, macros, attachments and signed-in
sessions are set up again. The old directory is neither read nor deleted – the installer
leaves it exactly where it is, for you to keep or remove.

**The installer stops wearing NSIS's stock blue wizard.** Its welcome and finish pages – and
the uninstaller's – now show the application's own mark, and so does the header of every page
between them. The graphics are drawn from the same four shapes as the icon, so there is one
source for the mark and no copy to fall out of step.

**The application no longer says its own name to Meta's servers.** Electron builds the default
User-Agent out of the application's name and version, and the code removing it matched a
literal `msg-hub/`. Renaming the application would have left `M-HUB/0.5.0` going out with
every request the account views make, silently, with the test that guards this still green.
Both the code and the test now ask the running application what it is called.

**Upgrading is an upgrade, not a second installation.** The identifier Windows records the
installation under is unchanged, so the 0.5.0 installer finds 0.4.0, removes it, and takes its
place: one entry in Settings, one folder under Programs. The file name is new, though, and a
Smart App Control verdict is per file – see the fingerprint below and `docs/installing.md`.

## 0.4.0 – the mark, a badge that stays put, and downloads that finish

Four things found in the first day of using 0.3.0.

**The taskbar shows msg-hub.** The application has a new mark – three isolated account modules
in one tile, the active one amber – and it now carries nine frames, from 16 to 256 pixels,
instead of one 256 that Windows had to scale down everywhere it actually draws an icon.

If you run from source, `npm run shortcut` writes a Start menu shortcut carrying that icon and
the application's identity; pin **msg-hub** from there and unpin any older "Electron" button.
Windows takes a pinned button's icon from the shortcut, never from the running window, so
pinning a source run without this pins `electron.exe` – Electron's own logo included. An
installed build needs none of it.

**The unread badge stops blinking.** A page with something waiting alternates its own title –
"(1) Messenger", then "Messenger", about once a second – and the badge was following it, on for
a second and off for the next. A count going up is still shown at once; a count dropping to zero
is now believed only after three seconds of zeros. Reading your last conversation clears the
badge a moment later; a blinking page never clears it at all.

**A download says how it ended.** The banner used to say "Downloading…" for the rest of the
session, with the file already on the disk. It now becomes "Saved …", with a button that opens
the folder the file landed in, and it takes itself away after a few seconds. A download that
failed or was cancelled says so and stays.

**Settings gained a download folder** and a "ask where to save every file" switch, which starts
on – that is what the application already did, it just had no way to say so or to stop. Turn it
off and files go straight to the folder you named, numbered rather than overwritten when a name
repeats.

Nothing in this version changes `accounts.json`, `macros.json` or the attachment store, and
nothing about it is one-way.

## 0.3.0 – staying alive, macros 2.0, whole services

**Accounts stay awake.** Chromium treats a view of zero height as a hidden tab and slows its
timers by an order of magnitude – measured here as 10 ticks of a 100 ms timer in ten seconds
against 101 while active. Every account but the current one is exactly that view, and once the
window goes to the tray so is the current one, which is the state this application exists to be
useful in. Background throttling is off.

**One copy, and a window that hides instead of dying.** A second launch reaches the window that
is already open rather than starting a rival over the same profile. The window button puts
msg-hub in the tray; Quit lives on the tray menu, and Settings has a switch for anyone who wants
the button to mean what it usually means. Autostart really starts hidden – Electron's
`openAsHidden` is documented as macOS-only, so the login item passes a flag instead.

**Keys.** `Ctrl+1..9` reaches a channel, `Ctrl+R` reloads the current account, `Ctrl+;` opens the
macro palette, and `Ctrl+Shift+Space` does it from anywhere. A global shortcut is a system-wide
exclusive: when another program already owns it, the status bar says so rather than the shortcut
quietly doing nothing.

**Clicking a notification lands on the account it came from** – the rail follows, instead of
leaving you in a conversation with the wrong channel highlighted.

**Links have a declared place to open.** Until now a link in a conversation opened a bare Electron
window: no address bar, no back, no reload, and inside the account's signed-in session. Every
address is now classified before it goes anywhere, and Meta's link shims – which make an outgoing
link look like a facebook.com address – are consulted before the host list.

**Recovery.** A stale or dead account can be reloaded without restarting the others. A crash, an
unresponsive view, or a laptop waking from sleep offers a reload on the status bar rather than
performing one: reloading throws away whatever is half-typed in a composer.

**A local log** the operator can read and safely send on: it records events and codes from a fixed
list of fields, never message content, and rotates to one older file.

**Macros 2.0.** Tags are in the interface, not only in the file format. A macro may carry
`{placeholders}`, and the application asks for them before the text goes anywhere – cancelling the
question leaves the clipboard exactly as it was. `{date}` and `{data}` fill themselves from the
clock. After an insertion the keyboard goes back into the account instead of staying with the
palette.

**LinkedIn and Facebook can be added as whole services.** LinkedIn is entered at `/feed/` on the
www host – the apex answers "Checking your browser - reCAPTCHA", measured twice. Notifications are
now controlled per account: messengers may interrupt out of the box, whole services stay quiet
until asked, and the account overrides its platform in either direction.

**Neither whole service shows an unread count.** `unreadFromTitle` reads "(99+)" correctly now – it
used to return zero, so the badge vanished exactly when an account was busiest – but LinkedIn's
number is the sum of eight badge sources, and Facebook's 2026 title format could not be confirmed
at all. A badge nobody has seen work would be a promise. Both are one word from being turned on,
and the reason sits on the entry in `src/main/accounts.js`.

### Going back a version deletes LinkedIn and Facebook accounts

A build older than 0.3.0 does not know those platforms. It drops such accounts out of
`accounts.json` while reading it, and writes the shortened list back on the next save – along with
their sign-ins, because a session partition is named after the account id. **This door only opens
one way.** Nothing else in this release is a one-way change.

### Installing

See `docs/installing.md`, attached below: this installer is not code-signed, and on a machine with
Smart App Control enabled it will be blocked no matter what you click. Running from source works
there and is the supported path.
