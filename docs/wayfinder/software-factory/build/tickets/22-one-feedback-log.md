---
title: "One feedback log per build; kit feedback"
type: task (AFK)
status: closed
assignee: sf-22
builder: claude
blocked_by: []
---

## Goal

Lex's feedback is recorded in six different ways today (research 01: a ticket opening "Lex (date)", Comments, a phase table, `NATIVE-PROJECT.md`, only a commit message, or nowhere). Decided: **one feedback log per build**, every correction one line with its kind and a link to the fix; it is the count the UX confidence ladder uses ([scoreboard resolution](../../tickets/04-grill-scoreboard.md#resolution-2026-10-22) item 3, [ladder](../../tickets/02-grill-ux-confidence-ladder.md#resolution-2026-10-22) item 4).

## Decided behaviour

- File `docs/wayfinder/<map>/build/feedback.md`, committed on `dev`, newest first under `## Feedback`. One line per correction, the same shape as the chat project's corrections list (`~/Projects/chat/memory/corrections/README.md`) so both count alike:
  `- 2026-10-23 · felt-wrong · "Lex's words" or short summary · after release: no · fix: [24](tickets/24-….md) | PR #n | open`
- Kinds: `too-much` (too much text or decoration), `below-bar` (looks below the bar), `felt-wrong` (felt wrong once used), `fault` (a real fault), `workflow` (how agents worked). `after release: yes` marks a UX problem Lex found on production (the ladder's step down).
- `kit feedback <map> --kind K [--after-release] [--fix <ticket|PR>] "<text>"` appends the line (creating the file with its heading and a one-line legend), prints it, and does not commit (the lead commits it with the ticket it opens). `kit feedback <map> --fix-for <line-number> <ticket|PR>` fills a fix link later.
- `node scripts/agents/tickets.mjs check` validates every `build/feedback.md` line (date, kind, after-release flag, fix field) and fails with `file:line`.
- The kitchen's house rule "a change Lex asks for always has a ticket that opens with 'Lex (YYYY-MM-DD): …'" stays; the ticket also gets its feedback line.

## Files

- `scripts/agents/kit.d/feedback` (new), `tests/kit-feedback.test.ts` (new)
- `scripts/agents/tickets.mjs`, `tests/agent-tickets.test.ts`
- `docs/agents/agent-scripts.md` (new `kit feedback` line), `docs/agents/issue-tracker.md` (where Lex's feedback goes), `docs/agents/kitchen.md` (stations 10 and 11)

## Done when

- Tests prove: the first call creates the file with heading and legend; lines go newest first; a bad kind exits 2; `--fix-for` fills the fix field; `tickets.mjs check` accepts a good log and names `file:line` for a bad date, kind or flag.
- `scripts/agents/kit unit --affected` and `node scripts/agents/tickets.mjs check` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only; not beside 30 or 50 (`tickets.mjs`).

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-sf22 -- scripts/agents/kit slice --ticket docs/wayfinder/software-factory/build/tickets/22-one-feedback-log.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-sf22 --timeout 2h`.
- Report: unit and tickets check `RESULT:` lines, a sample line, review decisions, PR and merge SHA.

## Done (2026-10-25)

- `scripts/agents/kit feedback <map> --kind K [--after-release] [--fix <ticket|PR>] "<text>"` adds one line under `## Feedback` in `docs/wayfinder/<map>/build/feedback.md`, newest first, creating the file with a `# Feedback: <map>` title, a one-line legend and the heading. It prints `file:line: <line>`, for example `docs/wayfinder/software-factory/build/feedback.md:7: - 2026-10-25 · felt-wrong · "too many buttons" · after release: no · fix: open`, and never commits. `--fix-for <line-number> <ticket|PR>` replaces that entry's fix. A ticket number (`24`, `3` for `03-…`, `24-slug`, `24-slug.md`) resolves in the map's `build/tickets/` (link `tickets/…`) or `tickets/` (link `../tickets/…`); a number found in both folders is refused as ambiguous, and a `tickets/` or `../tickets/` prefix picks the folder. `#12` or `PR 12` becomes `PR #12`. `--` ends the flags. Edits keep the log's BOM and CRLF line endings. A bad kind, unknown map or ticket, text with a newline or ` · `, or `--fix-for` on a non-entry line exits 2 with usage and leaves the log alone; a log without `## Feedback` exits 1 for both adding and `--fix-for`, and a fix link must be a file.
- `tickets.mjs` exports the shared format (`feedbackKinds`, `feedbackLegend`, `feedbackLine`, `parseFeedback`, `loadFeedback`). `tickets.mjs check` (also with `--ref`) validates every entry in each map's `build/feedback.md`: a real calendar date, a known kind, `after release: yes|no`, and a fix of `open`, `PR #n` or a link whose target exists; each problem names `file:line`. It prints `Feedback lines checked: N` after the ticket count when any log exists. `frontier` ignores the logs.
- Docs: `kit feedback` line in agent-scripts.md; issue-tracker.md's Build files names the log as the one place for Lex's feedback, with the line shape and kinds; kitchen.md stations 10 and 11 add the feedback line per correction.
- Tests: `tests/kit-feedback.test.ts` (creation with heading and legend, newest first, fix forms, `--fix-for`, exit 2 for bad input, missing heading) and a new `tests/agent-tickets.test.ts` case (a good log passes `check` from the working tree and `--ref`; a bad date, kind, flag, fix shape, missing link and malformed line each name `file:line`).
