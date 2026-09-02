# M-HUB – notes for agents working in this repository

## Typography is checked, not advisory

Prose here – documentation, interface strings, code comments, test names, commit messages –
follows [`docs/typography.md`](docs/typography.md). Two rules get broken out of habit:

- the dash between clauses is the en dash, U+2013; U+2014 is not used anywhere;
- the apostrophe is the ASCII one; U+2019 is not used, so a possessive that would otherwise need
  escaping inside a single-quoted string gets rephrased rather than escaped.

`tests/typography.test.js` enforces both over every tracked text file and runs under `npm test`,
so a literal em dash turns the suite red instead of reaching a release.
