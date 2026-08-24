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
> **[docs/uwaga-instalacja.md](docs/uwaga-instalacja.md)** before you download — it explains
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
| **Macro editor** | WhatsApp formatting bar, live preview, attachments added and removed in place |
| **Attachments** | PDF and mp4 **copied into the app's own storage** — you no longer need the original file; 100 MB limit |
| **Language** | English and Polish, switched in Settings without restarting; the choice survives a restart |

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

Rules 1 and 2 are enforced by tests — `tests/wstawianie.test.js` and `tests/granice.test.js` fail
the moment someone adds a forbidden dependency or a sending path.

## Development

```bash
npm test          # Vitest — logic
npm run test:e2e  # Playwright + Electron — operator paths on a real window
npm run dist      # portable .exe (builds locally)
```

The **installer** is built by [CI](.github/workflows/build.yml), not locally: NSIS generates its
uninstaller by *running* the freshly built installer, and Smart App Control kills that. The runner
has no Smart App Control, so `npm run dist:instalator` belongs there.

Source is plain JavaScript ESM, no bundler. **File names, functions and JSON keys are in Polish** —
the app was written that way and renaming them would buy nothing but churn. UI strings live in
[`src/renderer/jezyki/`](src/renderer/jezyki/) and are keyed, not hard-coded; a unit test fails if
the two dictionaries drift apart.

## Documentation

- [`docs/uwaga-instalacja.md`](docs/uwaga-instalacja.md) — what Windows does to an unsigned installer, and why
- [`docs/superpowers/specs/2026-08-23-msg-hub-design.md`](docs/superpowers/specs/2026-08-23-msg-hub-design.md) — the design: audit, architecture, data model, security boundaries, rejected alternatives
- [`docs/superpowers/plans/2026-08-23-msg-hub.md`](docs/superpowers/plans/2026-08-23-msg-hub.md) — the implementation plan, with the deviations and measurements made along the way

## Stack

Node 26, Electron 43, plain ESM JavaScript, no bundler. Vitest, Playwright, electron-builder.

## Licence

[MIT](LICENSE) © 2026 Marek Kencki
