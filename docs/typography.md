# M-HUB – typography

The project writes in two languages and puts text in three places: the interface, the
documentation, and the comments and test names in the code. What follows is settled, so the
question does not have to be answered again in every file, and so the sweep of 2026-09-02, which
replaced 505 dashes across 76 files, does not have to be repeated.

Characters that are not used are named by code point rather than shown. In most terminal and
editor fonts an en dash and an em dash are not told apart by eye, which is how the em dashes got
in.

## The rules

| Where | Rule |
| --- | --- |
| A dash between clauses | The en dash, U+2013, with a space on either side, in both languages. U+2014 is not used. |
| A hyphen | Compounds and code only: `close-to-tray`, `--publish never`. |
| Polish quotation marks | The pair „ ”, U+201E opening and U+201D closing. |
| English quotation marks | The ASCII double quote. U+201C is not used, in either language. |
| An apostrophe | The ASCII apostrophe. U+2019 is not used, so a possessive that would need escaping inside a single-quoted string is rephrased instead. |
| An ellipsis | The single character U+2026, not three periods. |
| A range | The en dash without spaces, as in `0.5.4–0.5.6`. |

U+201D is the Polish closing quote and the English right curly quote at the same time. That is why
the check bans U+201C rather than the pair: refusing the opening one is enough to keep English
text on ASCII quotes, and it leaves the Polish closing quote alone.

## Scope

The rules cover everything a person writes here: documentation, interface strings, code comments,
test names, and commit messages.

They do not cover:

- `package-lock.json`, which npm writes;
- `LICENSE`, which carries somebody else's words and is never edited;
- icons and other binaries;
- URLs, identifiers, paths, and anything inside a code span;
- a verbatim quotation of a message from Windows or another tool, which keeps the characters it
  came with. Nothing in the tree quotes one today. If one arrives and the check objects, the
  quotation wins and the exemption is recorded here.

## Not adopted

No non-breaking space after the Polish one-letter words. It is invisible in a diff, nobody would
keep it up by hand, and the window is wide enough that it buys nothing.

## The check

`tests/typography.test.js` reads every tracked text file and asserts three things:

- U+2014 appears nowhere;
- U+201C, U+2018 and U+2019 appear nowhere;
- U+201E and U+201D appear equally often in each file.

It runs under `npm test`, the step that gates every release, so a violation cannot reach a tag. A
failure names the file and the line.

Three rules are left to review rather than checked: the ellipsis, the hyphen, and the spacing
around the en dash. A check for those would report the spread operator and every command-line
flag, and a check that cries wolf is worse than none.

When this was written the tree held no em dash, 520 en dashes across 77 files, and balanced
Polish quotes in the four files that use them.
