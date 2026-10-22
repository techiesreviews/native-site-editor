---
title: "One feedback log per build; kit feedback"
type: task (AFK)
status: open
assignee:
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
