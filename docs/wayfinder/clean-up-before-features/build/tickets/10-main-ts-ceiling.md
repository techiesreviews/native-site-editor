---
title: "Ceiling check for main.ts"
type: task (AFK)
status: closed
assignee: runner-10
builder: sol
blocked_by: []
---

## Goal

A unit test that holds `src/main.ts` to a line ceiling, so the file can only shrink during this build. Lex's goal is about 500 lines ([ticket 05, item 1](../../tickets/05-grill-architecture-choices.md#resolution-2026-10-22)); the ceiling drops after each slice that edits `main.ts`.

## Decided behaviour

No user-visible change. The rule ([build README](../README.md#rules-for-the-whole-build)):

- The test fails when `src/main.ts` has more lines than `CEILING`, naming the count and the ceiling.
- It also fails when the count is 50 or more lines under `CEILING`, saying "lower the ceiling to N" (N = the count rounded up to the next 10), so every shrinking slice records its progress.
- `CEILING` starts at today's count rounded up to the next 10 (5,650 on `89ac5e0e`).

## Files

- `tests/main-ts-ceiling.test.ts` (new: the one constant, both checks, and a pure helper tested on fixed counts)
- `docs/agents/guardrails.md` (one line under the automated checks)

## Done when

- Green on `dev`; a fixed count above the ceiling fails naming the count, one 50 under fails naming the suggested ceiling.
- `npm run check` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Free-model candidate once T3 lists a verified zero-cost model; until then Sol.

- `kit doctor`, then `kit bg slice-10 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/10-main-ts-ceiling.md --builder sol` and `kit wait job slice-10 --timeout 2h`.
- `kit unit tests/main-ts-ceiling.test.ts`, then `kit unit --affected`.
- Review: `kit review --ticket <this ticket>` (GPT-6.1 Sol, medium, read-only; `kit slice` runs it). Land: `kit pr --ticket <this ticket>` into `dev`.
- Report: the `RESULT:` lines of doctor and unit, the review folder with findings fixed and rejected, PR number and merge SHA, the ceiling set.

## Done (2026-10-22)

- Added a 5,650-line ceiling for `src/main.ts`. Growth fails naming the count and ceiling; a reduction of 50 or more lines fails with "lower the ceiling to N", rounding N up to a multiple of 10. Documented the automated check in `docs/agents/guardrails.md`.
- Five unit tests cover the current file, growth diagnostics, accepted boundary counts, the exact 50-line threshold and rounding after larger reductions. Focused and affected unit runs both passed: `RESULT: ok unit 5/5 (1 files)`. `npm run check` and `npm run lint` passed; `RESULT: ok specs none affected`. Setup passed: `RESULT: ok doctor 7/7 checks passed`.
- No commits were created; changes are unstaged for the runner.
