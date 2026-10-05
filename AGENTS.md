# Thermool agent instructions

## Style (hard rule)

- Never use em dashes (U+2014) or en dashes (U+2013) in anything you write for
  me: chat replies, code comments, docstrings, markdown docs, commit messages,
  PR and issue text, or test names. No exceptions, including text you compose
  between quotes. Rewrite with commas, periods, colons, or parentheses.
- ASCII hyphen-minus (-) is always fine: CLI flags, `-1.5` numbers, hyphens in
  identifiers and hyphenated words, diff markers.
- When editing text you authored earlier, remove any stray occurrences you
  introduced. Verbatim third-party quotes in citations stay untouched.

## Agent skills

### Issue tracker

Issues live as markdown files under `.scratch/<feature>/` in this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Git

- Commit messages and PR descriptions get **no co-authorship / AI attribution lines** (no `Co-Authored-By: Claude …`, no "Generated with Claude Code").
