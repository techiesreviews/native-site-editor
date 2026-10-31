---
title: "`kit doctor` warns when a project has no tests wired and notes long always-read files; the review brief lists unit tests too"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [64-nova-skill-into-chat, 66-kit-changes-only-through-this-board, 77-check-the-retro-tickets]
---

## Goal

Lex (2026-10-30), after the lexvd.nl and script-editor retros. Three new doctor warnings, merged here because both change `kit.d/doctor`:

- **lexvd.nl:** its 1823-check Playwright suite lived only in `/tmp`, and the kit never said the project had no tests wired, so every review said "the repo has no tests" and nobody noticed why.
- **techies-prompter:** a 376-word bullet in `AGENTS.md` and a 6,244-character doc line (ticket 66's rule says always-read files stay short; this is its check).
- **script-editor:** dated reminders ("Due 2026-11-06: take the old route out") sat in docs and passed their date unseen.

## Check (ke-77, 2026-10-30): build smaller

Verdict on the [retro check](../retro-check-2026-10-30.md): build smaller.

- **Overdue reminders are dropped.** No project has a `Due YYYY-MM-DD:` line; only this ticket quotes one. Dated follow-ups go in tickets.
- **The review brief half is mostly there.** `review-brief.mjs` (`projectChecks`) already tells the reviewer which of `checks.check`, `checks.test`, `checks.lint` and the specs ran, or that the project sets none and not to report it. Only `unit.files` / `unit.run` is missing from that list.
- **No tests wired** fires in no kit project today (all wire `unit.*` and `checks.test`); it is a cheap guard for the next project moved onto the kit.
- **Long always-read files** are real in about 6 projects (lines over 600 characters in chat, lexvd's tools-first worktree, techies-prompter, the starter, creator-studio-poc and dogsfitandfun; techies-reviews' `AGENTS.md` is 1,630 words). A note, not a warning, so it nags without blocking.

## Decided behaviour

- **No tests wired:** `kit doctor` prints a warning line (never a failed check) when the settings wire no tests or checks: no `unit.files` or `unit.run`, no `checks.check`, `checks.test` or `checks.lint`, and no project `specs` command. The line names what to add ("wire your tests in scripts/agents/kit.json: unit.files, checks.test or a specs command").
- **Short always-read files:** `kit doctor` notes an `AGENTS.md` or `CLAUDE.md` at the project's top over 1,000 words (`doctor.agentsWords` in `kit.json` changes it) and any line in them over 600 characters, with file and line. A note, not a failure; a project under both prints nothing.
- **The review brief lists unit tests:** `projectChecks` in `review-brief.mjs` adds the unit command (`unit.run` over `unit.files`, or "the affected unit tests" for `kit unit --affected`) to what "the author already ran", so a project with only `unit.*` no longer reads as "sets no checks".
- One helper answers "which tests are wired" (in `review-brief.mjs` beside `projectChecks`, or `kit-lib.mjs`); doctor and the brief both use it.

## Files

- In the kit repo (`~/Projects/agent-kit`, public; a PR through its own `kit pr`): `kit.d/doctor`, `review-brief.mjs`, `kit-lib.mjs` (the helper), `tests/kit-doctor.test.ts`, the review-brief test, the settings docs (`doctor.agentsWords`), `docs/kitchen.md` (where doctor is described).
- `blocked_by` 64: its kit PR (agent-kit #6, `build/ke-64-skill-allow`) also changes `kit.d/doctor`; only that PR has to be merged first, not 64's chat and creator-studio parts. 66 and 67 also change `review-brief.mjs`; 66 is enough to wait for (67 adds one builder line only).

## Done when

- Doctor tests: a project with nothing wired gets the warning and still passes; one with only `unit.files` gets none; an `AGENTS.md` over the budget and a 700-character line are noted with file and line, a short one is not; `doctor.agentsWords` changes the budget. They fail before the change.
- The review brief test shows the unit command for a project with only `unit.*`, and "sets no checks" for a bare one.
- This editor's `kit doctor` passes with no new warning; agent-kit's `npm test`, `npm run lint` and `npm run test:kit-clean` pass.

## Kit commands and evidence

Agent Kit is required. In `~/Projects/agent-kit`: `scripts/agents/kit doctor`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines, the PR URL and merge SHA, and doctor's output here and in one project without tests. This ticket's Done lands on `dev` here with `scripts/agents/kit pr` (docs tier).

## Comments

- Lead, 2026-10-31 (prompter ↔ CamFrame retro, finding 4): also here, same file. `kit doctor` reports a main checkout behind its land branch as a ✓ note (`kit.d/doctor` line 98, "8 commits behind origin/main"), so a lead started work 8 commits behind. When the main checkout is behind `origin/<land>` after the fetch, print a warning line (not ✓, still not a failure) naming the count and `git pull --rebase`. A worktree branch behind its base keeps today's note (rebasing before landing is normal there). One test.
