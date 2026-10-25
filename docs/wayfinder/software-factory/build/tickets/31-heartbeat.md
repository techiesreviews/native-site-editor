---
title: "The 30-minute heartbeat: kit heartbeat and the T3 recipe"
type: task (AFK)
status: closed
assignee: sf-31
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

## Done (2026-10-25)

- `scripts/agents/kit.d/heartbeat`: `kit heartbeat <map> [--start]`. It reads every worktree's `kit bg --list` (worktrees from the dev worktree), keeps the `slice-*` jobs with a recorded `--ticket` (relative or absolute) in `docs/wayfinder/<map>/` (a group job from `kit next --run-group` has one per ticket: its lines read `<job> tickets=<a>,<b>`, its logs are every ticket's slice folder, and each slice merged before it ended gets a `merged:` line), and prints `finished:` (exit and last `RESULT:`, once per job run: the main root `.scratch/heartbeat/<map>.json` keeps reported runs by worktree, name and start time, plus log sizes; one heartbeat per map at a time under `flock -o`, a second waits up to `KIT_HEARTBEAT_LOCK_WAIT` seconds, default 600), `merged:` lines and one `preview:` reminder for the lead's `kit preview` (it never deploys), `running:` (age, log growth since the last heartbeat, over the job log plus the slice's `.scratch/kit-slice/<ticket-slug>/` phase logs and `builder/run.log`; a job listed `died` with no `pid` record in its first minute, or before its start time is written, is still launching and counts as running), `stuck: <job> log quiet <t>` when none of those logs was written for 45 minutes, then `kit next <map>` (`--start` passed through; killed after `KIT_HEARTBEAT_NEXT_TIMEOUT` seconds, default 1200; stderr kept in order; its `running:` lines dropped, its RESULT printed as `next RESULT: …`), then `done:` (`since tracking started` on the first run) and `running/next:` for Lex.
- Stop when nothing runs, starts, is ready or is delegated and every `waits:` line is `needs Lex` or `build not started`: `stop (frontier empty)` or `stop (only Lex-waits left)`. A `claimed by …, no running job found` wait (a failed slice the lead reruns, or a delegated ticket the free worker builds) keeps the heartbeat going and is named as `claimed with no job (<ticket>); the lead looks at it`; Lex-waits are named as `<n> waiting on you (<ticket>; …)`. A group's `waits: group <slug> tickets=<a>,<b> <reason>` line counts as one item, `group <slug>: <a>, <b>`. A failed `kit next` ends `RESULT: fail heartbeat next …`; any other failure (lock timeout, `git worktree list`, `kit bg --list`, a `kit next` timeout, the locked run killed by a signal) still prints `done: unknown (heartbeat failed)` and `running/next: the heartbeat failed (<why>); the lead looks at it` before `RESULT: fail heartbeat …`.
- Docs: kitchen.md station 5 has the heartbeat recipe (T3 `schedule_task` prompt, stuck and claimed-with-no-job handling, delegated tickets checked through T3 `delegate_task`, preview after merges, delete on stop, restart order); agent-scripts.md has the `kit heartbeat` line; runner.md's restart line points to it (runner.md stays within its 96-line guard).
- `tests/kit-heartbeat.test.ts` (fake kit and fake job records, 20 tests): finished jobs listed once and a same-name rerun listed again; merged and preview lines, and none for a slice that ends without a PR (`finished`); age, log growth and `stuck` at 47 minutes (not 44); a running job with no log is stuck at 50 minutes; a job log quiet for 50 minutes with a phase log written a minute ago is not stuck, its growth comes from the phase logs, and all of them quiet for 46 minutes is stuck; only `slice-*` jobs count; an absolute `--ticket` path counts; a mid-launch job is running, then reported once when it finishes, and `died` after the grace minute; a job with no start time yet is running; stop for an empty frontier, for `needs Lex` and for `build not started`; continue for other waits, ready tickets, claimed-with-no-job waits (with or without Lex-waits, and for an assignee with spaces), delegated tickets and a bare `waits:` line; `--start` passed to `kit next`, its started jobs keep it going, a ticket claimed meanwhile is not "ready to start"; two heartbeats at once report a finished job once; a held lock times out with both Lex lines printed and a bad lock wait is refused; a `kit bg --list` failure and a `git worktree list` failure fail the run with both Lex lines; a `kit next` timeout and a killed locked run end with both Lex lines; a failed hand-out keeps its stderr line before its RESULT; usage errors exit 2; a group job is one running line with its tickets, stuck only when all its tickets' phase logs are quiet, and when it fails after one merge lists that merge and `failed (exit 1) after merging PR #7`; a group's `waits:` line is one item (claimed with no job, waiting on you, or other work).
- `scripts/agents/kit unit --affected`: `RESULT: ok unit 20/20 (1 files)`.
- Real run on `dev` with the final code (no `--start`, throwaway `KIT_MAIN_ROOT` so the lead's first check-in still lists everything); a second run printed `done: nothing new since the last check` and no `finished:` lines:

```
finished: slice-sf20 exit 0 RESULT: ok slice docs/wayfinder/software-factory/build/tickets/20-findings-by-kind.md PR #172 ef43a0f
finished: slice-sf21 exit 1 RESULT: fail slice pr: command exited 1: rebase: conflict in docs/agents/kitchen.md; see /home/ubulex/Projects/native-site-editor-build-sf-21-kit-records-every-piece/.scratch/kit-slice/21-kit-records-every-piece/pr.log
finished: slice-sf22 exit 1 RESULT: fail slice pr: command exited 1: unit: npm exited 1; see /home/ubulex/Projects/native-site-editor-build-sf-22-one-feedback-log/.scratch/kit-slice/22-one-feedback-log/pr.log
finished: slice-sf30 exit 0 RESULT: ok slice docs/wayfinder/software-factory/build/tickets/30-kit-next.md PR #175 23fca97
finished: slice-sf31 exit 1 RESULT: fail slice fix: 4 open findings after 3 rounds (/home/ubulex/Projects/native-site-editor/.scratch/reviews/sf-31/20261025T123543Z/result.md)
finished: slice-sf40 exit 0 RESULT: ok slice docs/wayfinder/software-factory/build/tickets/40-ux-rulebook.md PR #171 3af9d51
finished: slice-sf41 exit 0 RESULT: ok slice docs/wayfinder/software-factory/build/tickets/41-feature-list.md PR #174 6f90840
finished: slice-sf42 exit 0 RESULT: ok slice docs/wayfinder/software-factory/build/tickets/42-kit-ux-scripted.md PR #177 2ef4557
finished: slice-sf44 exit 0 RESULT: ok slice docs/wayfinder/software-factory/build/tickets/44-feature-list-guard.md PR #180 ffff883
finished: slice-sf50 exit 0 RESULT: ok slice docs/wayfinder/software-factory/build/tickets/50-triage-groups.md PR #178 3c5a648
finished: slice-sf60 exit 0 RESULT: ok slice docs/wayfinder/software-factory/build/tickets/60-context-card.md PR #170 df9d68a
merged: slice-sf20 PR #172 ef43a0f
merged: slice-sf30 PR #175 23fca97
merged: slice-sf40 PR #171 3af9d51
merged: slice-sf41 PR #174 6f90840
merged: slice-sf42 PR #177 2ef4557
merged: slice-sf44 PR #180 ffff883
merged: slice-sf50 PR #178 3c5a648
merged: slice-sf60 PR #170 df9d68a
preview: scripts/agents/kit preview (lead step; the heartbeat never deploys)
running: slice-sf23 age 52m log 41.7 KB (first check)
running: slice-sf43 age 16m log 3.5 KB (first check)
running: slice-sf45 age 5m log 3.0 KB (first check)
waits: docs/wayfinder/software-factory/build/tickets/31-heartbeat.md claimed by sf-31 (this session), no running job found
waits: docs/wayfinder/software-factory/build/tickets/51-weekly-sweep.md shares docs/agents/kitchen.md with slice-sf23
next RESULT: ok next 0 ready, 2 waiting
done: 11 slices since tracking started: slice-sf20 merged (PR #172), slice-sf21 failed (exit 1), slice-sf22 failed (exit 1), slice-sf30 merged (PR #175), slice-sf31 failed (exit 1), slice-sf40 merged (PR #171), slice-sf41 merged (PR #174), slice-sf42 merged (PR #177), slice-sf44 merged (PR #180), slice-sf50 merged (PR #178), slice-sf60 merged (PR #170)
running/next: 3 building (slice-sf23, slice-sf43, slice-sf45), 1 claimed with no job (31-heartbeat); the lead looks at it, 1 waiting on other work
RESULT: ok heartbeat continue
```

### Follow-ups (lead, after round 4)

- P2 fault, `scripts/agents/kit.d/heartbeat` `saveState`: finished jobs are marked reported before `kit next` runs and before the next-timeout check; if anything throws after the save, those finished lines are lost. Save after `kit next`.
- P2 race, `kit.d/heartbeat` next timeout: SIGTERM to `kit next --start` inside `claim()` skips its clean-up (`checkout`, `reset --keep origin/dev`). Let `next` handle SIGTERM and clean up, or time out with a signal it traps.
- P3 fault, `kit.d/heartbeat` launching jobs: a `died` job with no `pid` and unknown age counts as launching forever (a launcher killed between `kit bg`'s record writes). Give launching a time limit.
