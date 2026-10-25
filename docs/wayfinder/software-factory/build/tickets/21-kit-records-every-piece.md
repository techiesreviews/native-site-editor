---
title: "The kit records every piece; kit score"
type: task (AFK)
status: closed
assignee: sf-21
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

## Done (2026-10-25)

- **Record helper** (`kit-lib.mjs`): `kitScore({ ticket, branch, root }, change)` reads, changes and atomically rewrites (temp file and rename, under a lock folder so a lead's review from another worktree never drops a slice's update; a lock whose owner pid died, or older than ten waits, is moved aside and removed only if it is still the folder judged stale; an owner file that cannot be written removes its own lock) one record per piece in the main root `.scratch/scoreboard/<map>/<ticket-slug>.json`; tickets outside `docs/wayfinder/<map>/` go under `_untracked/<ticket-slug>.json`, runs without `--ticket` under `_untracked/<encoded-branch>.json`. Each write refreshes `ticket`, `title` and `kind` (`type:` plus the Size cell of the ticket's build README row, read under the header of that row's own table, e.g. `task (AFK) M–L`). A failed write prints one `problem: scoreboard …` line per command and never throws. `scoreReview` adds or replaces a review by its evidence folder (`findings.json`, else counts read from `result.md`); `scoreCost` keeps each run folder's reported cost with its role (build or review), so a resumed run's growing log is never counted twice; `cost` is `{ build, review }`, each summed apart by `costTotal` (`partial: true` when some runs reported tokens only), `null` when nothing was reported. `runCost` reads Claude/Grok JSON `total_cost_usd` and token usage (`modelUsage`, else `usage`) and Codex `tokens used` lines.
- **Writers:** `kit slice` records the builder `{ model, effort, previousModels, built }` (`built` is the model that did the build), every phase attempt `{ name, start, end, exit }` (failed attempts keep the child's exit code), rounds, the review of each phase and fix round, the build's cost and the merge `{ pr, sha, at }`, keeping the full SHA and time `kit pr` recorded when it prints a short SHA; `kit fix` records each round, a switched builder (old model appended to `previousModels`), its builder's cost and the declined list of the review it answered; `kit review` records each review it saves; `kit pr` records `{ pr, tier }` on open, `ci` pass/fail, `sha`, `at` and the waiver reason on merge, `queued` with a merge queue (only a waiting `kit slice` fills in a queued merge's SHA and time); a new PR number starts a fresh landing.
- **`kit score [map] [--json] [--snapshot]`** (new `kit.d/score`): one row per piece (builder, minutes as summed phase durations, rounds, findings by kind across reviews, build cost and review cost with dollars and tokens side by side and `>=$` for partly priced dollars, PR or `#N open`); a map with no records prints `score: <map> (0 pieces)`, then totals per builder (credited to the model that did the build; the row shows `<built> -> <current>`) and per kind; no map lists every map with records; unreadable records are skipped with a `problem:` line. `--json` prints `{ map, pieces, totals: { builders, kinds }, feedback }` (no map: `{ maps }`), review folders relative to the main root and the per-run cost map left out; `feedback` is `build/feedback.md` or `null`. `--snapshot` writes the same object to `docs/wayfinder/<map>/build/scoreboard.json` and refuses a map without a build folder; with `--json` its `snapshot:` line goes to stderr so stdout stays parseable.
- **Docs:** `kit score` line in `docs/agents/agent-scripts.md`; kitchen station 10 now lists the scoreboard as built, with Lex's corrections and the visual page still planned.
- **Tests:** `tests/kit-score.test.ts` (rows and per-builder/per-kind totals from two fixture records; `--json` and `--snapshot` match one fixture object, feedback log included when present; bad options; unreadable records; `runCost` for Claude JSON, resumed logs, Codex and Grok, missing cost stays `null`; ticket kind and size, no double count on rewrite, untracked branch path; one problem line on a failed write; size read per table when a README has several rows and tables; eight parallel writers lose no update, a lock left by a dead pid or with no owner after ten waits is taken over, and a live owner's lock held past the wait is one problem line, an unwritable owner file leaves no lock and the next write does not wait; the real `kit review` with a fake Claude CLI records its evidence folder, model, counts and review cost; a switched-builder row and totals credit the build model; a tokens-only builder reviewed by priced Claude shows the review's dollars only in the review column and totals; `costTotal` sums and marks partial dollars; an empty map reports 0 pieces; `--json --snapshot` stdout parses as JSON). `tests/kit-slice.test.ts`: a slice with a failed review attempt, then build, two fix rounds and a merged PR, leaves one record with phases and exit codes, two rounds, three reviews with counts by kind and the merge; a blocked scoreboard prints one `problem: scoreboard` line and the slice still lands; real `kit fix` and the slice agree on rounds and the switched builder; a real `kit fix` round records its builder's reported tokens and the declined list on the review it answered; a short SHA from `kit pr` keeps the recorded full SHA and time; a queued PR's record gets the 40-character merge SHA; a standalone `kit fix --builder` updates the builder, keeps `built` and appends the old model. `tests/kit-pr.test.ts`: the record gets PR, tier, CI, merge SHA and time, the waiver reason, and `ci: fail` when CI fails; a queued PR records `queued: true` without a SHA, and a new PR number drops the old landing.
- Pending, for the lead after merge: the `kit score software-factory` output (Done when item 3) is taken after this slice's own `kit pr` and added here; the slice cannot produce it before landing.
