---
title: "Review findings: severity read after any location, and \"Spec defects:\" headings"
type: task (AFK)
status: open
assignee: lead-sf10 (free worker build)
builder: opencode/deepseek-v4.1-flash-free
blocked_by: []
---

## Goal

Clean-up follow-up (slice 95, PR #119): `openFindings` in `scripts/agents/review-findings.mjs` (about line 49) looks for the severity only in a finding's first 80 characters, so `commit:<long ticket path>:line — P2: …` reads as "no severity" and blocks `kit pr` after three rounds (it blocked PR #119 three times). Research 01 also counted 17 unreadable reviews from findings listed under a `Spec defects:` / `Standards defects:` heading, which the parser does not know.

## Decided behaviour

- Severity is the first `P0`–`P3` token after the finding's location: strip a leading location (`<sha>:<path>:<line>` or `<path>:<line>`, line may be a range, optional backticks) and the separator after it (`—`, `–`, `-`, `:`), then read `\bP[0-3]\b` in the next 40 characters. `(P2)` and `**P2**` count. With no location, today's rule applies to the first 80 characters.
- Headings `Spec defects`, `Standards defects` (with or without colon, bold or `#`) open the Spec / Standards defect groups, like `Defects — Spec` today.
- Nothing else changes: blocking rules, Validation gaps without severity, Optional nits ignored. Kitchen ticket 04 ("record review findings in a clear, structured way", [resolution](../../tickets/04-grill-scoreboard.md#resolution-2026-10-22)) builds on this parser (slice 20).

## Files

- `scripts/agents/review-findings.mjs`
- `tests/review-findings.test.ts`

## Done when

- `tests/review-findings.test.ts` proves: a finding with a 150-character ticket path before `— P2:` reads P2; `(P1)` and `**P3**` read; a P-token only inside the evidence text far after the location does not count as severity; a `Spec defects:` heading with `<sha>:path:line — P1: …` bullets yields Spec P1 findings; every existing case still passes.
- `scripts/agents/kit unit tests/review-findings.test.ts tests/kit-pr.test.ts` and `scripts/agents/kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit only; may run before the clean-up lands and beside 11 and 12.

- Free worker through T3 `delegate_task` (provider OpenCode, model `deepseek-v4.1-flash-free`) in worktree `build/sf-10-review-findings-severity` (`ASE_OWNER=sf-10`); its brief names this ticket, the Files list and `scripts/agents/kit doctor`, `scripts/agents/kit unit …` as above. One attempt plus one correction; then Claude (`--builder claude-opus-5-5`).
- Review: `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit review --ticket docs/wayfinder/software-factory/build/tickets/10-review-findings-severity.md`; land: `ASE_OWNER=sf-10 scripts/agents/kit pr --ticket <same>`.
- Report: unit `RESULT:` lines, review folder and decisions, PR and merge SHA.

## Done (2026-10-22)

- Severity is now read after a finding's leading location (`<sha>:<path>:<line>` or `<path>:<line>`, line ranges and backticks included) and its separator, within the next 40 characters; `(P1)` and `**P3**` count, and a P-token only in far-off evidence does not. Findings without a location keep the first-80-characters rule. A 150-character ticket path before `— P2:` now reads P2.
- `Spec defects` and `Standards defects` headings (bare, `:`, bold or `#`) open the Spec and Standards defect groups alongside `Defects — Spec` and `Defects — Standards`.
- Tests: `ASE_OWNER=lead-sf10 scripts/agents/kit unit tests/review-findings.test.ts tests/kit-pr.test.ts` — `RESULT: ok unit 147/147 (2 files)`; `ASE_OWNER=lead-sf10 scripts/agents/kit unit --affected` — `RESULT: ok unit 147/147 (2 files)`; `npm run check` — exit 0.
- Commit: `69e232f0` (code and tests).
