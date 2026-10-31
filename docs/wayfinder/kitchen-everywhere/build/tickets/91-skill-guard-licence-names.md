---
title: "Skill guard: licence files with a prefix in skill folders count as licences, so a project's own MIT LICENSE can land"
type: task (AFK)
status: open
assignee: ke-91
builder: claude
blocked_by: []
---

## Goal

Found by the idea-board lead (2026-10-31) while landing idea-board's first slice (`w0-1-scaffold`): `kit pr` refused the project's standard MIT `LICENSE` with `RESULT: fail skill-guard 12 problem(s); paid skills never go in a repo` (`LICENSE:20: holds a line from the local skill sites`). There is no waiver, so idea-board landed its scaffold without the licence for now and adds it before its first public release.

## Cause

`skill-guard.mjs` skips licence texts in skill folders through the `licence` pattern (line 23), which only matches file names that *start* with `license`, `licence`, `copying` or `notice`. Skill folders on this machine hold licence texts under other names, so their lines are read as skill text:

- `~/.codex/plugins/cache/openai-curated-remote/sites/1.1.2/skills/sites/templates/vinext-starter/vendor/shadcn-tailwind-4.13.0.LICENSE.md`
- `…/sites-vite-plugin.LICENSE` (same plugin)
- `…/morning/assets/fonts/Fraunces-OFL.txt`

Any project's word-for-word MIT, Apache or OFL text then matches them.

## Decided behaviour

- A skill file whose name ends in a licence name counts as a licence too: `<anything>.LICENSE`, `<anything>.LICENSE.md|txt`, `<anything>-LICENSE…`, and font licences `<anything>-OFL.txt` / `OFL.txt`. Matching stays case-insensitive.
- A file merely named like one keeps being read (the pattern's existing intent: `license-check.py`, `notice-and-consent.md`).
- Belt and braces: a changed file in the project whose own path is a licence (`LICENSE`, `LICENSE.md`, `COPYING`, …) is skipped by the line check, as licence texts are shared word for word by design.
- Nothing else in the guard changes.

## Files

- `skill-guard.mjs` (in the kit)
- its test file in the kit's `tests/`

## Done when

- A test with a skill folder holding `x-1.0.LICENSE.md`, `y.LICENSE` and `Font-OFL.txt` with the MIT/OFL text, and a project diff adding a standard MIT `LICENSE`, passes the guard; a test with `license-check.py` holding skill text still fails it.
- After the kit update, idea-board's `kit pr` lands a commit adding its MIT `LICENSE` (idea-board's `w5-1-first-release-check` waits on it).

## Kit commands and evidence

`kit doctor` first; the kit's unit tests for the guard; `kit review`; land through the kit's own `kit pr`. The report quotes each `RESULT:` line.
