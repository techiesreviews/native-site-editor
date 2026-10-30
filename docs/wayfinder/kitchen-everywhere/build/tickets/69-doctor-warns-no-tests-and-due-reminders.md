---
title: "`kit doctor` warns when a project has no tests wired and lists overdue reminders; the review brief names the project's test commands"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [64-nova-skill-into-chat, 67-testing-and-review-rules]
---

## Goal

Lex (2026-10-30), after the lexvd.nl and script-editor retros. Three new doctor warnings, merged here because both change `kit.d/doctor`:

- **lexvd.nl:** its 1823-check Playwright suite lived only in `/tmp`, and the kit never said the project had no tests wired, so every review said "the repo has no tests" and nobody noticed why.
- **techies-prompter:** a 376-word bullet in `AGENTS.md` and a 6,244-character doc line (ticket 66's rule says always-read files stay short; this is its check).
- **script-editor:** dated reminders ("Due 2026-11-06: take the old route out") sat in docs and passed their date unseen.

## Decided behaviour

- **No tests wired:** `kit doctor` warns (a warning line that never counts as a failed check) when the project's settings wire no tests or checks: no `unit.files` or `unit.run`, no `checks.*`, and no project `specs` command. The line names what to add ("wire your tests in scripts/agents/kit.json: unit.files, checks.test or a specs command").
- **Overdue reminders:** `kit doctor` lists lines of the form `Due YYYY-MM-DD: <what>` in the project's Markdown docs (`AGENTS.md`, `docs/**/*.md`; a `reminders.globs` key in `kit.json` replaces those globs) whose date is before today, one line each with file and line number, as a warning. None due prints nothing.
- **Short always-read files:** `kit doctor` notes (a warning, not a failure) an `AGENTS.md` or `CLAUDE.md` over 1,000 words (`doctor.agentsWords` in `kit.json` changes it) and any line in them over 600 characters, with file and line.
- **The review brief names the test commands:** `review-brief.mjs` tells the reviewer which test and check commands the project has (from the same settings), or says plainly that none are wired, so a review no longer guesses "the repo has no tests".
- The doctor code for each warning sits in its own section (the script-editor builder's note), and the shared "which tests are wired" reader is one helper that ticket 72 reuses.

## Files

- In the kit repo (`~/Projects/agent-kit`, public; a PR through its own `kit pr`): `kit.d/doctor`, `review-brief.mjs`, `kit-lib.mjs` (the helper), `tests/kit-doctor.test.ts`, the review-brief test, the settings docs (`reminders.globs`, `doctor.agentsWords`), `docs/kitchen.md` (where doctor is described).
- `blocked_by` 64: its kit PR (agent-kit #6, `build/ke-64-skill-allow`) also changes `kit.d/doctor`; only that PR has to be merged first, not 64's chat and creator-studio parts. 67 also changes `review-brief.mjs`.

## Done when

- Doctor tests: a project with nothing wired gets the warning and still passes; one with `unit.files` gets none; a past `Due` line is listed with file and line, a future one and a malformed date are not; `reminders.globs` replaces the defaults; an `AGENTS.md` over the budget and a 700-character line are noted, a short one is not. They fail before the change.
- The review brief test shows the test commands for a wired project and "none wired" for a bare one.
- This editor's `kit doctor` passes with no new warning; agent-kit's `npm test`, `npm run lint` and `npm run test:kit-clean` pass.

## Kit commands and evidence

Agent Kit is required. In `~/Projects/agent-kit`: `scripts/agents/kit doctor`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines, the PR URL and merge SHA, and doctor's output here and in one project without tests. This ticket's Done lands on `dev` here with `scripts/agents/kit pr` (docs tier).
