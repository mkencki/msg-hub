# Code signing policy

This page states who signs M-HUB's binaries, what exactly gets signed, where those binaries
come from, and what the application does with the data of the people who run it. It exists
because a signature is a claim about identity and origin, and a claim of that kind should be
checkable rather than assumed.

Last reviewed: 2026-09-02.

## What is signed

Only one artefact is published, and only that artefact is signed: the Windows installer
`M-HUB-<version>-installer.exe`, attached to a [GitHub release](https://github.com/mkencki/m-hub/releases).
Nothing else is distributed – there is no portable build, no separate updater, and no
third-party download mirror. A file carrying M-HUB's name from anywhere other than that
Releases page did not come from this project.

Every release page carries the SHA256 of its installer, so the file can be checked against the
release before it is run.

## Who signs, and in which role

The project is maintained by one person, Marek Kencki (GitHub: **@mkencki**), who is the sole
owner of the source repository, the release workflow and the signing credentials. SignPath's
roles therefore map as follows:

| Role | Held by |
|---|---|
| Author – writes and commits the code | @mkencki |
| Reviewer – approves the change into `main` | @mkencki |
| Approver – releases and signs it | @mkencki |

**This is stated plainly rather than dressed up.** A one-person project cannot separate these
duties, and pretending otherwise would be the opposite of what a signature is for. What
compensates is that the whole path is public and reconstructible: every signed installer is
built from a tagged, publicly readable commit by a workflow whose definition is in the same
repository.

If the project ever gains maintainers, this table is updated before any of them touches the
signing path, and the roles are separated.

## Where the binaries come from

Signed installers are **never built on a developer machine**. They are built by GitHub Actions,
from [`.github/workflows/build.yml`](https://github.com/mkencki/m-hub/blob/main/.github/workflows/build.yml),
and only from a pushed tag `v*`. The workflow, in order:

1. checks out the tagged commit;
2. runs the unit test suite (`npm test`);
3. runs the end-to-end suite against the real application (`npm run test:e2e`);
4. builds the installer (`npm run dist:installer`);
5. runs a further end-to-end test against the packaged application;
6. records the installer's SHA256 into the release body;
7. attaches the installer to the release.

A failure at any step stops the release. Nothing is attached by hand, and the artefact
published is the artefact the workflow produced.

## Account and credential security

Multi-factor authentication is enabled on the GitHub account that owns this repository and on
the signing service account. Signing credentials are never stored in the repository, never
written into workflow files, and never exported to a developer machine; the workflow reaches
them through GitHub Actions secrets.

## What the application does with data

M-HUB is a shell around web sessions. It loads Messenger, WhatsApp Web, LinkedIn and Facebook
in isolated Electron sessions, one per account, and the data those services exchange goes
between the service and the person using it. The application adds nothing of its own to that
traffic.

- **No telemetry, no analytics, no crash reporting.** The application contacts no server
  belonging to this project, because there is none.
- **Everything is local.** Accounts, macros, attachments and signed-in sessions live under
  `%APPDATA%\M-HUB` on the user's own machine. Nothing is uploaded or synchronised.
- **The log is deliberately narrow.** `src/main/log.js` writes only the fields on an explicit
  allow-list – account id, platform, error code, reason, count, duration. Page titles are
  excluded on purpose, because they carry the unread counts *and the names of the people in
  the conversation*. The log is meant to be safe to send to somebody who is helping.
- **The application's own name is removed from the User-Agent**, so the services an account
  visits are not told which client is talking to them.
- **Notifications are asked for, not assumed.** A whole service such as LinkedIn or Facebook is
  refused notification permission until the operator allows it.

M-HUB does not collect user data and does not transfer it to any system the user has not
chosen, so there is no data-collection behaviour to disclose during installation and nothing to
switch off.

## What the application will never do

The project has a standing boundary, enforced by a test rather than by a promise
([`tests/boundaries.test.js`](https://github.com/mkencki/m-hub/blob/main/tests/boundaries.test.js)):
it contains no library that reaches into WhatsApp Web's internals – `wppconnect`,
`@wppconnect/wa-js`, `whatsapp-web.js`, `baileys` and `venom-bot` are all refused by that test –
and it never synthesises input to send a message on the user's behalf. It contains no feature
for identifying or exploiting security vulnerabilities and none for circumventing any security
measure.

## Installation and uninstallation

The installer installs per-user, under `%LOCALAPPDATA%\Programs\M-HUB`, and never requires
administrator rights. Uninstallation is available from **Settings → Installed apps** and from
`Uninstall M-HUB.exe` in the installation folder.

**The profile is deliberately left behind on uninstall.** Accounts, macros and attachments
survive removing the application, so that reinstalling or upgrading does not cost the operator
their setup. To remove them as well, delete `%APPDATA%\M-HUB` by hand.

## Reporting a problem with a signed binary

If a file signed in this project's name looks wrong – a signature that does not match, a
SHA256 that differs from the release page, a binary obtained from anywhere but the Releases
page – open an issue at https://github.com/mkencki/m-hub/issues, or write to the address on
the GitHub profile @mkencki. Reports about a signed artefact are answered before feature work.
