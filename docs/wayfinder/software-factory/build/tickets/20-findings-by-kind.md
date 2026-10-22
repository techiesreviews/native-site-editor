---
title: Review findings carry a kind
type: task (AFK)
status: open
assignee:
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
