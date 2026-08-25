# msg-hub

A Windows desktop app that keeps Messenger and two WhatsApp accounts in one window —
each in a fully isolated session — plus text macros with attachments.

Interface in **English** and **Polish**. English is the default; switch it in Settings.

**[Polski / Polish version of this README](README.pl.md)**

---

## Why it exists

It replaces **All-in-One Messenger Hub**, which since 2026-07-18 requires a Pro licence for a
second WhatsApp account. An audit of that app turned up two reasons not to buy it: no reachable
entity responsible for the data, and `wppconnect-wa.js` on board — a library that reaches into
WhatsApp Web's internals, which risks a permanent ban on the phone number.

This app does neither. See **[What it will never do](#what-it-will-never-do)**.

## Install

Download the installer from [Releases](https://github.com/mkencki/msg-hub/releases).

> **The installer is not code-signed.** Windows will warn you, and on a clean Windows 11 install
> **Smart App Control will block it outright**. Read
> **[docs/installing.md](docs/installing.md)** before you download — it explains
> which of the two you are seeing and what to do about each.

Running from source works even when Smart App Control is enabled:

```bash
git clone https://github.com/mkencki/msg-hub.git
cd msg-hub
npm install
npm start
```

## What it does

| | |
|---|---|
| **Accounts** | as many as you like, each in a `persist:<id>` partition — cookies, `localStorage` and `IndexedDB` fully isolated |
| **Channel rail** | collapses to bare channel colours, expands on hover, pins open; unread count per account |
| **Settings** | add an account, rename it, change its colour, reorder the rail, remove it along with its session |
| **Macros** | `Ctrl+;` opens a searchable palette — arrows to choose, Enter to insert; edit and delete behind a confirmation |
| **Macro editor** | WhatsApp formatting bar, live preview, attachments added and removed in place, tags |
| **Placeholders** | write `{name}` in a macro and it asks you before it inserts; `{date}` fills itself |
| **Attachments** | PDF and mp4 **copied into the app's own storage** — you no longer need the original file; 100 MB limit |
| **Language** | English and Polish, switched in Settings without restarting; the choice survives a restart |
| **Keyboard** | `Ctrl+1`..`Ctrl+9` jump to a channel, `Ctrl+;` opens macros, `Ctrl+Shift+Space` does it from any program, `Ctrl+R` reloads the account you are looking at |
| **Tray** | closing the window keeps the app running and noticing; switch it off in Settings. Autostart really does start hidden |
| **Recovery** | a crashed, hung or stale account offers a reload in the status bar — nothing reloads by itself, because that would throw away a half-typed message |
| **Links** | a link out of a conversation opens in your own browser, not in a window without an address bar carrying your signed-in session |

Macros and attachments live in `%APPDATA%\msg-hub` (`macros.json` and the `att/` directory),
accounts in `accounts.json` next to them. Deleting a macro or detaching a file cleans the storage,
so a multi-megabyte video never lingers on disk without an owner.

Renaming an account **does not touch its identifier**, because the session partition is built from
it (`persist:<id>`) — fixing a typo will not sign you out.

## The interface

The app wraps someone else's UI, so its own chrome is deliberately desaturated: the only saturated
colour in the window is the colour of the active account. It outlines the whole working area,
because the one real risk this product carries is **mistaking which account you are in** — sending
something from your private WhatsApp to a work contact, or the reverse. The new-account form
suggests a colour that is not yet in use, so no two accounts look alike.

Channels sit in a rail on the left rather than in tabs along the top: WhatsApp Web and Messenger
both have their own header, and a bar above a bar turned into visual mush. The rail collapses to
48 px and expands on hover; the pin button at the top holds it open, and that choice survives a
restart. Expanding **pushes** the account view aside instead of covering it — the views are a
native layer above the renderer, so an overlay drawn in HTML would hide *underneath* the messenger
page.

Typefaces are system ones, with **not a single network request**: this app grew out of a privacy
audit, so fetching fonts from someone else's server on every start would contradict it.

## What it will never do

Three boundaries. They come from the audit and are not negotiable:

1. **It does not send messages.** A macro prepares the content and stops. Enter belongs to you.
2. **It does not load `wa-js`, WPPConnect, Baileys or anything of that family.** Pages load exactly
   as Meta serves them.
3. **It inserts through the clipboard only.** No DOM manipulation of the loaded pages, attachments
   included.

Rules 1 and 2 are enforced by tests — [`tests/insertion.test.js`](tests/insertion.test.js) and
[`tests/boundaries.test.js`](tests/boundaries.test.js) fail the moment someone adds a forbidden
dependency or a sending path.

### The log

The app writes a plain-text log to `%APPDATA%\msg-hub\logs\`, reachable from the tray menu.
It exists so that helping someone whose app will not sign in does not require sitting at their
computer.

**It records kinds of event and error codes, and nothing else.** No message text, no macro
content, no attachment names, no page titles and no conversation names. An account appears by
its identifier, never by the name you gave it — that name is frequently a person. This is not
a promise about how the logging code is written: `src/main/log.js` writes only the fields on a
short declared list and silently drops everything else, and
[`tests/log.test.js`](tests/log.test.js) fails if that list grows without someone meaning it to.

The file is capped and rotated, keeping at most one older copy, so it cannot fill a disk.
A log you can read, and choose to send, is the opposite of telemetry.

## Development

```bash
npm test          # Vitest — logic
npm run test:e2e  # Playwright + Electron — operator paths on a real window
npm run dist      # portable .exe (builds locally)
```

The **installer** is built by [CI](.github/workflows/build.yml), not locally: NSIS generates its
uninstaller by *running* the freshly built installer, and Smart App Control kills that. The runner
has no Smart App Control, so `npm run dist:installer` belongs there.

Source is plain JavaScript ESM, no bundler, and everything — file names, identifiers, comments,
JSON keys and test descriptions — is in English. It was not always: the app began as a private tool
written in Polish, and version 1 of the on-disk format still carries Polish keys. Both spellings
are accepted on read and version 2 is written back on the next save, so upgrading costs nobody
their accounts or macros. That contract is pinned by [`tests/migration.test.js`](tests/migration.test.js).

Layout:

| Path | What lives there |
|---|---|
| `src/main/` | the main process: accounts, macros, views, the IPC bridge, the window shell |
| `src/renderer/` | the window's own interface — HTML, CSS and the renderer script |
| `src/shared/` | code both processes need: the translation core and the dictionaries |
| `src/preload/` | the context bridge (CommonJS — Electron does not load ESM here) |

UI strings live in [`src/shared/locales/`](src/shared/locales/) under keys rather than in the code.
A unit test fails the moment the two dictionaries drift apart, so a new string cannot land in one
language and show a bare key in the other.

## Documentation

- [`docs/installing.md`](docs/installing.md) — what Windows does to an unsigned installer, and why
- [`docs/design.md`](docs/design.md) — the design: audit, architecture, data model, security boundaries, rejected alternatives

## Stack

Node 26, Electron 43, plain ESM JavaScript, no bundler. Vitest, Playwright, electron-builder.

## Licence

[MIT](LICENSE) © 2026 Marek Kencki
