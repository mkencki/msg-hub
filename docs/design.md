# msg-hub — design

Written: 2026-08-23
Status: approved, implemented
Translated from the Polish original: 2026-08-24

## 1. Purpose

One window on Windows for three messenger accounts: Messenger, a private WhatsApp and a
work WhatsApp. It replaces the paid All-in-One Messenger Hub, which — after the grace
period for existing users ended on 2026-07-18 — requires a Pro licence to run a second
WhatsApp account.

This project follows an audit of that application. The audit showed that the only feature
actually needed — several accounts of the same platform — comes down to isolated browser
profiles and requires no reverse engineering whatsoever. It also showed that the other app
loads `wppconnect-wa.js` (WPPConnect/wa-js v3.23.2), a library that reaches into the
internals of WhatsApp Web. That breaches WhatsApp's terms and risks a permanent ban on the
phone number. The operator's work number is one of the accounts in question, so avoiding
that entire category of tooling is an overriding requirement, not a preference.

**Widened 2026-08-25.** An account no longer has to be a messenger. See section 2,
*Whole services*: the mechanism the audit identified — an isolated browser profile in a
native view — turns out to be indifferent to what the profile holds, and the operator has
uses for two sites whose messaging is only one page among many. The purpose above still
describes what the application is *for*; it no longer describes the limit of what it may
hold.

## 2. Scope

### In scope

- three (eventually any number of) accounts in one window, each in an isolated session
- a configurable account list in a JSON file, plus an add-account screen in the app
- macros: saved fragments of text with WhatsApp formatting, and attachments
- dark theme, remembered window size and position
- a system tray icon and start-with-Windows
- system notifications and an unread count on the taskbar icon

### Out of scope

- locking the window with a PIN or Windows Hello (rejected by the operator)
- separate rules for the work account, a mute schedule (rejected)
- a notification bridge to `ntfy` (deferred; returns only if native notifications fail)
- any automatic sending of messages (forbidden — see section 7)
- contact export, chatbots, AI replies (the `wa-js` category, forbidden — see section 7)
- a web version and access from the work laptop (withdrawn by the operator, 2026-08-23)

### Whole services

*Amended 2026-08-25, by the operator's decision.*

An account may host a **whole service**, not only its messaging surface. LinkedIn and
Facebook enter the design as full sites — `linkedin.com`, `facebook.com` — rather than as
`/messaging/` and `/messages/`. Messaging on those two is one page inside a site the
operator reads anyway, and splitting it off would mean keeping the same login open twice.

This is a change of what the product *is*, not a longer list of URLs. A messenger is a
single screen the user watches; a social network is a place they navigate. Four
consequences follow, and none of them is optional:

1. **A navigation and child-window contract becomes a precondition, not a nicety.** A whole
   service is full of outbound links, and its sign-in legitimately crosses origins
   mid-flow. Without a policy the application is a browser with no address bar, no back
   button and notifications granted in advance — a worse place to click a stranger's link
   than the real browser next to it. Each platform therefore declares the hosts it owns
   and the hosts it authenticates through. Anything else opens in the system browser.
   Naive rules break this in both directions: blocking every off-origin navigation breaks
   OAuth, and allowing any host that merely *contains* the service name admits
   `facebook.com.example.invalid`.
2. **The unread badge stays honest and therefore stays absent.** `unreadFromTitle` reads a
   leading `(N)` from the page title, which is a convention of Meta's two messengers, not a
   general mechanism. Every other wrapper in this category reads the count by injecting a
   script that scrapes the page; section 7 forbids that, and the prohibition does not bend
   for a service the operator happens to want. A service whose title carries no count gets
   **no count**, and relies on the system notification instead. A badge that guesses is
   worse than a blank one.
3. **Notifications become a per-account matter.** A messenger notifies when a person writes
   to you. A social network notifies about reactions, groups, pages, birthdays and things
   it would like you to look at. Granting the permission once for every account, as the
   application does today, does not survive contact with a full Facebook.
4. **Platforms remain a closed list.** The obvious generalisation — an account type that
   takes any URL — is refused. It would turn a reviewed allowlist into an uncontrolled
   browser carrying live sessions, and it is a security regression wearing the costume of
   flexibility. Adding a service stays a deliberate edit to this design.

Section 7 is untouched by any of this. A whole service is still a page loaded exactly as
its owner serves it, with nothing injected into it.

## 3. Architecture

A single Electron application, run locally. No server, no containers, no dependency on any
existing infrastructure.

```
main window (BrowserWindow)
├── channel rail + macro panel          ← renderer, plain HTML/CSS
└── content area
    ├── WebContentsView  session persist:acc-messenger  → messenger.com
    ├── WebContentsView  session persist:acc-wa-priv    → web.whatsapp.com
    └── WebContentsView  session persist:acc-wa-work    → web.whatsapp.com
```

Isolation comes from a separate session partition per account. The two WhatsApp accounts
see each other as two independent browsers — they share no cookies, no `localStorage` and
no `IndexedDB`. This is the heart of the application and the one mechanism without which
there is no product.

`WebContentsView` is Electron's current API for multiple views; `BrowserView` is deprecated
and the `webview` tag is discouraged by Electron itself. For content that needs its own
session, the documentation points directly at `WebContentsView` with a separate partition.

## 4. Components

Each component has one responsibility and can be tested on its own.

### 4.1 `accounts` — the account registry

Reads and writes the account list and assigns partition identifiers. Knows nothing about
windows.

### 4.2 `views` — the view manager

Creates a `WebContentsView` per account, attaches its session, sets the `User-Agent`,
governs geometry as the window resizes, and switches the active view. Knows nothing about
where the account list came from.

### 4.3 `macros` — the macro store

Holds macro definitions and copies of attachments, and searches by name and content. Knows
nothing about how a macro reaches a chat.

### 4.4 `insertion` — putting content in

Places text or a file on the clipboard and triggers a paste in the active view. The only
component that touches the clipboard. It does not send messages — ever (section 7).

Text goes through Electron's `clipboard.writeText`. A file needs the `CF_HDROP` format —
the one Windows sets on `Ctrl+C` in Explorer and the one Chromium hands to a page as
`DataTransfer.files`. Electron's `clipboard.writeBuffer('FileNameW', …)` handles only a
single file and gives no assurance that Chromium will interpret it that way, so we use the
method **verified empirically in stage 0**: calling
`powershell.exe -NoProfile -STA -Command "Set-Clipboard -LiteralPath …"`.

A catch found in stage 0: `Set-Clipboard -LiteralPath` and `Get-Clipboard -Format` exist
**only in Windows PowerShell 5.1**. PowerShell 7 has neither parameter, so the call must
name `powershell.exe` explicitly, never `pwsh`.

Cost: starting a process, on the order of hundreds of milliseconds. If that turns out to be
noticeable, the alternative is a native module setting up a `DROPFILES` structure — a purely
performance decision, not a functional one, and taken only after measurement.

### 4.5 `shell` — the window shell

Window, tray, autostart, dark theme, remembered layout, notifications, badge.

## 5. Data model

Everything lives in the application data directory (`app.getPath('userData')`).

### 5.1 `accounts.json`

```json
{
  "version": 2,
  "accounts": [
    {
      "id": "acc-wa-work",
      "name": "WhatsApp work",
      "platform": "whatsapp",
      "url": "https://web.whatsapp.com/",
      "color": "#2f7d5b"
    }
  ]
}
```

`id` is immutable — it serves as the partition name (`persist:acc-wa-work`). Changing `id`
means losing the session, so the interface does not allow editing it. `platform` selects the
default address and icon; `url` can be overridden by hand.

> Schema version 1 used Polish key names (`wersja`, `konta`, `nazwa`, `platforma`, `kolor`),
> because the app began as a private tool. Both spellings are accepted on read and version 2
> is written back on the next save, so upgrading costs nobody their accounts. See
> `tests/migration.test.js`.

### 5.2 `macros.json`

```json
{
  "version": 2,
  "macros": [
    {
      "id": "mac-client-area",
      "name": "Guide — Client Area",
      "text": "*How to add a driver:*\n\n1. Sign in\n2. Open the Drivers tab\n\n> Get in touch if anything is unclear.",
      "attachments": ["att/4f2a-guide.pdf"],
      "tags": ["client-area", "guide"]
    }
  ]
}
```

The `text` field stores **plain text with WhatsApp markers**, not rich text. WhatsApp
supports bold (asterisks), italics (underscores), strikethrough (tildes), a code block
(triple backticks), inline code (single backticks), a quote (greater-than at the start of a
line), a bulleted list (dash or asterisk plus a space) and a numbered one (digit, dot,
space). It has no underline. The markers behave identically on desktop and on the phone.

A consequence accepted deliberately: the markers are WhatsApp's. The same text pasted into
Messenger will show raw asterisks. Macros are aimed mainly at clients on WhatsApp, so
WhatsApp is the target format.

### 5.3 The attachment store

An attachment added to a macro is **copied** into the `att/` directory in the app data,
under a name prefixed with a UUID. This delivers the operator's requirement: files should
live in the application, so they need not be hunted down on disk each time. Deleting a macro
deletes the copies nothing else links to.

The interface shows the total size of the store. Single-file limit: 100 MB — safely below
WhatsApp's own limits and above a typical instructional video.

## 6. Flows

### 6.1 Application start

1. Read `accounts.json`; with no file, run the first-account wizard.
2. Create a view per account, with a `persist:<id>` session and an overridden `User-Agent`.
3. Restore the window size and position and the last active channel.
4. Inactive views load in the background so notifications work for every account.

### 6.2 Using a macro

1. The macro panel (`Ctrl+;`) with search across name and content.
2. Choosing a macro inserts the text into the message box of the active chat.
3. If the macro has an attachment, it goes in as a separate step, after the text.
4. **The application stops there.** The operator sends the message by pressing Enter.

### 6.3 Adding an account

An "Add account" screen: name, platform from a list, optionally a custom address and channel
colour. Saved to `accounts.json`, a view created, and sign-in by QR code or the platform's
own form — exactly as in a browser.

## 7. Security boundaries

Three rules the design does not cross. They follow directly from the audit of 2026-08-23.

**7.1 The application does not send messages.** A macro prepares the content and stops.
Preparing a message is user behaviour; sending it automatically would be the automation the
audit warned about. The boundary is here, not further out.

**7.2 The application does not load `wa-js`, WPPConnect, Baileys or any related library.**
No access to the internals of any page an account loads. Pages load exactly as their owner
serves them.

**7.3 Content is inserted through the clipboard.** A clipboard write and a paste are
indistinguishable from doing it by hand. Stage 0 settled this rule positively and **without
exceptions** — see section 9. The application does not manipulate elements of a loaded page
for any purpose, attachments included.

Beyond these rules the application is an ordinary browser with tabs.

> **Generalised 2026-08-25, alongside the *Whole services* amendment in section 2.** Rules
> 7.2 and 7.3 were written naming WhatsApp, because at the time WhatsApp was the only page
> whose internals anyone would have been tempted to reach into. Now that an account may
> host any service on the list, a prohibition that names one site would have left the
> others outside it — which is the opposite of what these rules are for. The wording is
> widened to every page an account loads; nothing is relaxed, and the reason is unchanged.
> The temptation the rules exist to refuse is the same one in every case: reading a page's
> DOM to obtain an unread count. Section 2 states the consequence plainly — a service whose
> title carries no count gets no count.

## 8. Error handling

| Situation | Behaviour |
|---|---|
| `accounts.json` damaged | a backup copy alongside it, start with an empty list, message shown |
| no network | the view shows the platform's own state; the app does not intervene |
| WhatsApp refuses the client (`User-Agent`) | an explicit message suggesting an update |
| attachment file missing from the store | the macro is marked incomplete, the text still works |
| file over the limit | refused, with the size and the limit reported |
| session signed out | the view shows a QR code; the app does not intervene |

## 9. Stages

**Stage 0 — settling the clipboard question. DONE 2026-08-23, result POSITIVE.**

The question: does WhatsApp Web accept a file pasted from the Windows clipboard (`CF_HDROP`)?

How it went. The first layer was checked by reading the artefact, not by the absence of an
error: `Set-Clipboard -LiteralPath` in Windows PowerShell 5.1, then `Get-Clipboard -Format
FileDropList` confirmed one file on the clipboard with the text layer empty. The second layer
was checked by hand by the operator, in Edge on `web.whatsapp.com`, in a chat with himself,
outside the audited application (that one loads `wa-js` and would have given a false positive).

Material: a 10.23 MB instructional video (signature `ftypmp42`) and a 0.74 MB PDF — real
files of the same class as future macro content. Sizes were chosen below WhatsApp's limits so
that a refusal could not be blamed on file size.

Result: **both types pasted correctly.** The video showed a player with a caption field, the
document a file card. A visible thumbnail strip with a button to add another attachment
confirms that several files can be inserted one after another.

Consequences: substituting a file into the page's form field is **not needed and does not
enter the design**. Rule 7.3 applies without exception. Stage 3 builds the clipboard path only.

**Stage 1 — the core.** `accounts`, `views`, `shell`. Three accounts, isolation, channels,
`User-Agent`, dark theme, window layout, tray, autostart, notifications.

**Stage 2 — text macros.** `macros`, `insertion`, the panel with search, the editor with a
formatting bar and a preview, the `Ctrl+;` shortcut.

**Stage 3 — attachments.** The `att/` store, insertion per the result of stage 0.

**Stage 4 — distribution.** `electron-builder`, a single installer, autostart.

**Stage 5 — staying alive. DONE 2026-08-25.**

The app is asked to sit in the tray all day and notice things. Everything here serves that,
and each item below was measured before it was changed rather than assumed.

- **The rail no longer closes under the operator's own cursor** when another window takes the
  foreground. Chromium reports that as a mouseleave carrying the position the pointer had all
  along; `acceptHoverReport` in `shell.js` weighs the report, and returning to the foreground
  asks the renderer where the pointer is now, because holding a report back loses it.
- **Accounts in the background run at full speed.** `backgroundThrottling` was unset, so a
  100 ms timer ticked 10 times in ten seconds in a hidden view instead of 100 — and hiding the
  window to the tray put the ACTIVE account in that state too.
- **A second copy over the same profile gives up** instead of fighting the first over the
  cookie stores, where the loser loses its sign-in.
- **The window button puts the app in the tray**, on by default, switchable in Settings.
  Autostart passes `--hidden` on the command line and the window is built unshown;
  `openAsHidden` is macOS-only and did nothing here.
- **Ctrl+1..9 selects a channel by position** and **Ctrl+Shift+Space** raises the window and
  opens the macro palette from anywhere. A refused global shortcut is reported rather than
  left silent.
- **Clicking a notification lands on the account it came from.** A view taking focus asks the
  renderer to switch — but not until its first load has settled, because a view takes focus
  while it is being created and the app would otherwise start on whichever account happened
  to finish last.
- **A stale or dead account can be reloaded** without restarting the others: Ctrl+R, and a
  button in the status bar offered after a crash, a hang, a failed load or waking from sleep.
  Nothing reloads on its own, because reloading throws away a half-typed message.
- **A local log** in `%APPDATA%\msg-hub\logs\`, reachable from the tray. It writes only the
  fields on a declared list and drops everything else, so it can be sent to somebody. Page
  titles are excluded precisely because they carry contact names.
- **The clipboard session survives a bad day**: stderr is drained, a timed-out process is put
  down rather than reused, and a clipboard that refuses a file is reported instead of
  escaping the handler.

**Stage 5.6 — the navigation contract** is called out separately because stage 7 depends on
it. Every address now has a declared place to open: the account view, a controlled child
window, the system browser, or nowhere. The decision rests on host lists a platform declares,
never on how a window was asked for — a sign-in popup and a link to an article cannot be told
apart by disposition or features. Host matching is a suffix comparison on a dot boundary, the
external list is consulted first because link shims live on the service's own domain, and only
`http:` and `https:` are ever handed to the system.

## 10. Tests

Behaviour is tested, not implementation detail.

- **session isolation** — proof that a cookie written in one account's partition is invisible
  in another's. The heart of the product, so covered by a test rather than by inspection.
- `accounts` — read, write, damaged file, missing file, refusal to change `id`
- `macros` — adding, searching, deleting along with attachment copies, the size limit
- `insertion` — content reaches the clipboard in the expected shape; **a negative test: no
  path invokes sending a message** (enforcement of rule 7.1)
- `shell` — the window layout survives a restart

## 11. Risks

| Risk | Weight | Response |
|---|---|---|
| WhatsApp refuses the client over `User-Agent` | high | override the UA from the first launch; stage 1 |
| Electron's Chromium too old for WhatsApp | medium | keep the version fresh; the fix is a version bump |
| Delay inserting a file (`powershell.exe` startup) | low | measured in stage 3; noticeable above ~500 ms, beyond that a native module |
| The attachment store growing without bound | low | per-file limit, a usage counter, copies deleted with the macro |

The risk "the clipboard does not accept files" was **closed** in stage 0 (2026-08-23). With
it went the risk of being sensitive to Meta rebuilding the page — the mechanism of
substituting a file into a form does not enter the design.

## 12. Rejected alternatives

Recorded for the record. The road to this design was long, and these dead ends are documented
so that nobody walks back into them.

**A web version as a page with tabs.** Not feasible. `web.whatsapp.com` sends
`frame-ancestors https://*.whatsapp.com https://whatsapp.com`, and `www.messenger.com` sends
`frame-ancestors 'self'`. Embedding either in a frame on a foreign domain is blocked by the
browser. Working around it with a rewriting proxy was rejected: WhatsApp Web rests on
WebSockets, service workers and Web Crypto, and that kind of manipulation would be
indistinguishable from an attack.

**A hub on a server, streamed with Neko (WebRTC).** Rejected after looking at the topology:
WebRTC media travels over UDP, while the operator's ingress is a Cloudflare Tunnel on a CGNAT
link. It would require a TURN server or open UDP ports — the first adds a dependency billed
by traffic, the second is impossible.

**A hub on a server, streamed with KasmVNC.** Technically feasible (WebSockets pass through
the tunnel) and designed all the way to the deployment stage, then withdrawn on 2026-08-23
along with the decision to drop access from the work laptop. It would have cost WSL2 and
Docker Engine on a node — the first container in that infrastructure and a permanent widening
of the maintenance surface.

**Cloudflare browser-based RDP.** A workable fallback should remote access ever return as a
requirement: available on all plans, reuses the existing `cloudflared` and CF Access, and
leaves the RDP port on loopback. Dropped for the same reason as above.

**C# WPF with WebView2, and Tauri 2.** A lighter result (roughly 15 MB and 10 MB against
roughly 200 MB), but the first needs the .NET SDK installed and pulls in a stack outside the
operator's toolkit, while the second needs a Rust toolchain and rests on a young API across
several webviews.
