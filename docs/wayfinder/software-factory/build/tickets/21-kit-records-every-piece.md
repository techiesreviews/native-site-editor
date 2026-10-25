---
title: "The kit records every piece; kit score"
type: task (AFK)
status: open
assignee: sf-21 (this session)
builder: claude
blocked_by: [20-findings-by-kind, 13-kit-defaults-follow-pins]
---

## Goal

The scoreboard's data, recorded by the kit with no hand work: per piece of work, which model built it, how long it took, how many review rounds, what each review found by kind, what it cost where known, and how it landed ([scoreboard resolution](../../tickets/04-grill-scoreboard.md#resolution-2026-10-22) item 1). Today research 01 needed a throwaway script to count anything.

## Decided behaviour

- **One record per piece**, written by the kit in the main root `.scratch/scoreboard/<map>/<ticket-slug>.json` (map = the ticket's `docs/wayfinder/<map>/` folder; a run without `--ticket` goes under `_untracked/<branch>.json`). Written and updated by `kit slice` (each phase), `kit fix` (each round), `kit review` (each review), `kit pr` (tier, PR number, CI result, merge SHA and time, waive reason). Fields: `ticket`, `title`, `kind` (the ticket's `type:` plus size from the build README row if present), `builder` `{ model, effort, previousModels }`, `phases` `[{ name, start, end, exit }]`, `rounds`, `reviews` `[{ dir, model, counts by kind and severity, declined }]`, `cost` `{ usd, tokens }` where the CLI reports it (Claude JSON `total_cost_usd` and `usage`; Codex and Grok token lines when present; else null, never guessed), `landed` `{ pr, sha, at, tier, waived }`. Writes are atomic (temp file and rename).
- **`kit score [map] [--json]`** prints one row per piece (builder, minutes, rounds, findings by kind, cost, PR) and totals per builder and per kind of job; with no map, every map with records. `--json` prints the merged data the page (slice 23) uses, including the feedback log once slice 22 exists (read `build/feedback.md` when present, else none).
- **Snapshot:** `kit score <map> --snapshot` writes `docs/wayfinder/<map>/build/scoreboard.json` for the lead to commit at the end of a build (the records under `.scratch` are machine-local).
- Recording failures never fail the command they ride on: they print one `problem: scoreboard …` line.

## Files

- `scripts/agents/kit-lib.mjs` (one small record helper)
- `scripts/agents/kit.d/slice`, `scripts/agents/kit.d/fix`, `scripts/agents/kit.d/review`, `scripts/agents/kit.d/pr` (one call each where a phase ends)
- `scripts/agents/kit.d/score` (new), `tests/kit-score.test.ts` (new)
- `tests/kit-slice.test.ts`, `tests/kit-pr.test.ts` (record written)
- `docs/agents/agent-scripts.md` (new `kit score` line), `docs/agents/kitchen.md` (station 10's planned line, recording part)

## Done when

- Tests prove: a fake slice run (build, two fix rounds, PR merged) leaves one record with phases, rounds, review counts by kind and the merge; a record write failure prints `problem: scoreboard` and the slice still succeeds; `kit score` prints the row and per-builder totals from two fixture records; `--json` and `--snapshot` output match a fixture; Claude JSON cost is read, a missing cost stays null.
- `scripts/agents/kit unit --affected` green.
- The Done section shows `kit score software-factory` output after this slice's own `kit pr` (it records itself).

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit only; alone in `kit.d/slice`, `kit.d/pr` and `kit-lib.mjs`. Sol gives one second opinion on the final version: `ASE_REVIEW_MODEL=gpt-6.1-sol scripts/agents/kit review --ticket <ticket>` (lead).

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-sf21 -- scripts/agents/kit slice --ticket docs/wayfinder/software-factory/build/tickets/21-kit-records-every-piece.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-sf21 --timeout 2h`.
- Report: unit `RESULT:` lines, `kit score software-factory` output, review decisions, PR and merge SHA.
