---
title: Review findings carry a kind
type: task (AFK)
status: closed
assignee: sf-20
builder: claude
blocked_by: [10-review-findings-severity]
---

## Goal

Lex (F5, 2026-10-22): record review findings in a clear, structured way, so later decisions (skipping reviews for docs, choosing builders) come from evidence. Today kinds exist only as a keyword sort made once by hand for research 01 (ticket mismatch 167, stale state and races 148, …), and rejected findings live only as prose in each ticket's Done.

## Decided behaviour

From [scoreboard resolution](../../tickets/04-grill-scoreboard.md#resolution-2026-10-22) item 1:

- Every defect finding names one **kind** after its severity: `P2 fault:`, `P1 ticket:`, `P2 race:`, `P3 style:` (real fault, mismatch with the ticket, timing/race, style). The review brief (`scripts/agents/review-brief.mjs` and the brief `kit review` builds) states the four kinds with one line each and an example.
- `openFindings` returns `kind` (`fault` | `ticket` | `race` | `style` | `unsorted`). A missing or unknown kind is `unsorted`; it never blocks on that account (blocking stays by severity only).
- `kit review` writes `findings.json` beside `result.md` in its evidence folder: `{ model, effort, scope, head, findings: [{ group, severity, kind, text }] }`, with counts by kind and severity. An unreadable review writes `{ unreadable: true }`.
- `kit fix` records each finding the builder declined, with its reason, in the round file it already writes, and appends `declined: [{ text, reason }]` to that review's `findings.json`.

## Files

- `scripts/agents/review-brief.mjs`, `scripts/agents/review-brief.sh` (only if the text lives there)
- `scripts/agents/review-findings.mjs`
- `scripts/agents/kit.d/review`
- `scripts/agents/kit.d/fix` (declined list only)
- `tests/review-findings.test.ts`, `tests/kit-review.test.ts`, `tests/kit-fix.test.ts`
- `docs/agents/agent-scripts.md` (`kit review` line), `docs/agents/runner.md` (Review and close: one sentence on kinds), `docs/agents/kitchen.md` (station 8's planned line)

## Done when

- Tests prove: each kind parses in the bold, backtick and plain variants; a finding without kind is `unsorted` and blocks exactly as before; `findings.json` is written with counts for a fake review, and `{ unreadable: true }` for an unreadable one; a declined finding lands in `declined` with its reason.
- One real smoke run: `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit review --commit <this slice's build commit>` writes a `findings.json` whose findings all have a kind (report its counts line).
- `scripts/agents/kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit only; alone in `review-findings.mjs` and `kit.d/review`.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-sf20 -- scripts/agents/kit slice --ticket docs/wayfinder/software-factory/build/tickets/20-findings-by-kind.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-sf20 --timeout 2h`.
- Report: unit `RESULT:` lines, the smoke review's RESULT line and counts, review decisions, PR and merge SHA.

## Done (2026-10-25)

- The review brief (`reviewFormat` in `scripts/agents/review-brief.mjs`) asks for `commit:path:line — P1 fault: …` and states the four kinds (fault, ticket, race, style) with one line and an example each.
- `openFindings` returns `kind` for every finding: the word right after the severity, read in plain, bold and backtick forms (`P2 fault:`, `**P2 fault:**`, `` `P2 race` ``, `` `P2` `race` ``), case-insensitive. Only a whole label counts (`P2 fault-tolerance …` stays `unsorted`). A missing or unknown kind is `unsorted`; validation gaps carry `kind: null` like their `severity: null`. Blocking still goes by severity only.
- `kit review` writes `findings.json` beside `result.md`: `{ model, effort, scope, head, findings: [{ group, severity, kind, text }], counts: { kind, severity } }` (gaps count as `gap` in both, so severity `none` is only a defect whose severity could not be read), or `{ model, effort, scope, head, unreadable: true }` when the report does not parse, and prints a `findings N: <kind counts>; <severity counts>` line before its RESULT.
- `kit fix` asks the builder for `- <finding> — reason: <why>` under `Declined:` (only a dash before `reason:` splits, at the first such marker; an item without one keeps its whole text with an empty reason, shown as "none given"), writes the declined list with reasons at the end of its `round-N.md`, and appends `declined: [{ text, reason, round }]` to the fixed review's `findings.json`. A retried builder phase gets its brief without the previous attempt's list and replaces that round's list in both records, so they always agree. Reviews saved before `findings.json` existed are left alone; a damaged or unwritable one is left as is with one `problem:` line, and the round carries on.
- Docs: `kit review` line in agent-scripts.md, one sentence on kinds in runner.md Review and close, station 8's evidence line in kitchen.md (no longer planned).
- Tests: `tests/review-findings.test.ts` (kinds in every variant, unsorted blocks as before, record and counts, unreadable), `tests/kit-review.test.ts` (fake review writes `findings.json` with counts; unreadable report; brief names the kinds; evidence now five files), `tests/kit-fix.test.ts` (declined finding lands in the round file and `declined` with its reason; a retried builder phase leaves one list in each; reviews without `findings.json` and `--note` rounds still get the round-file list and no new `findings.json`; a finding that mentions `reason:` stays whole; a retry that declines a different finding leaves only the new one in both records; a damaged or unwritable `findings.json` does not stall the round), and a review whose CLI is missing saves no `findings.json` and prints no findings line. `scripts/agents/kit unit --affected`: 275/275.

### Follow-ups

- Spec (P3): a521f4c2:scripts/agents/kit.d/fix:279 — P3 race: when a builder phase is retried, the list is removed from `round-N.md` before the builder runs (`writeFileSync(
- Validation gaps (gap): `tests/kit-fix.test.ts`: add a test where a builder phase records declines, then the retry's builder fails (for example a `FAKE_MODE` that exits non-zero, or a 
- Validation gaps (gap): `tests/kit-fix.test.ts`: every kit-fix test writes `findings.json` by hand. Add one end-to-end test: run the fake `kit review` so `kit.d/review` writes the real

