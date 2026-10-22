---
title: "The 30-minute heartbeat: kit heartbeat and the T3 recipe"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [30-kit-next]
---

## Goal

While a build runs, a T3 `schedule_task` bound to the lead's thread checks in every 30 minutes; it stops itself when the frontier is empty or everything left waits on Lex ([hand-out resolution](../../tickets/05-grill-hand-out.md#resolution-2026-10-22) item 1). The clean-up build's heartbeat of 2026-10-22 was the first rough version, written by hand. Make the check one kit command, so each check-in costs a few hundred tokens and is the same every time.

## Decided behaviour

- `kit heartbeat <map> [--start]` prints, in this order: finished jobs since the last heartbeat (name, exit, last `RESULT:`; state kept in the main root `.scratch/heartbeat/<map>.json`), running jobs (age, log growth), **stuck** jobs (log unchanged for 45 minutes: `stuck: <job> log quiet 47m`), then `kit next <map>` (with `--start` when given), and finally exactly two plain lines for Lex: `done: …` and `running/next: …` (the global "two-line status" rule). Last line: `RESULT: ok heartbeat continue` or `RESULT: ok heartbeat stop (<frontier empty | only Lex-waits left>)`.
- Merged slices are listed for the lead's `kit preview` step; the heartbeat never deploys.
- **The recipe** in `docs/agents/kitchen.md` station 5 (replaces today's sentence): create the schedule with T3 `schedule_task` (every 30 minutes, bound to the lead's thread) with the prompt text given there: run `scripts/agents/kit heartbeat <map> --start` in the dev worktree; post the two lines to Lex; on `stuck:` look at that job's log tail and decide (`kit fix --note`, a helper agent, or tell Lex); after a merge run `kit preview` and the scoreboard page at milestones; on `RESULT: … stop` delete the schedule (`delete_scheduled_task`) and tell Lex. After an app restart: `kit bg --list`, then `kit heartbeat`.
- Memory note `keep-long-builds-alive` says 15 minutes and `--timeout 9m`; the kitchen's 30 minutes and `kit wait job --timeout 2h` win; the slice does not touch memory files (the lead updates them).

## Files

- `scripts/agents/kit.d/heartbeat` (new), `tests/kit-heartbeat.test.ts` (new)
- `docs/agents/kitchen.md` (station 5), `docs/agents/agent-scripts.md` (new line), `docs/agents/runner.md` (Waiting: one line pointing to the heartbeat)

## Done when

- Tests with fake job records prove: finished jobs are listed once (second run does not repeat them); a quiet log over 45 minutes is `stuck`; the stop result for an empty frontier and for "only non-AFK left"; `--start` passes through to `kit next`.
- `scripts/agents/kit heartbeat software-factory` on real `dev` output pasted in Done.
- `scripts/agents/kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only. The schedule itself is created by the lead when the next build starts (T3 tool, not the builder).

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-sf31 -- scripts/agents/kit slice --ticket docs/wayfinder/software-factory/build/tickets/31-heartbeat.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-sf31 --timeout 2h`.
- Report: unit `RESULT:` lines, real heartbeat output, review decisions, PR and merge SHA.
