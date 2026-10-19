---
title: "kit bg: background jobs by name, and kit wait job"
type: task (AFK)
status: closed
assignee: ke-02
blocked_by: []
builder: sol
---

## What

Today a runner starts a long job, then waits with `kit wait pid <pid> --timeout 9m` again and again
(328+ times in the Durable Object build), first finding the pid with `ps | grep`. `kit wait`
(`scripts/agents/kit.d/wait`) knows only `pid`, `output` and `ci`; nothing records what a job was.

- **`kit bg <name> [--cwd DIR] -- <command…>`** (new `scripts/agents/kit.d/bg`): starts the command
  detached (`setsid` + `nohup`, its own process group, stdin `/dev/null`, survives an app restart).
  Records under the worktree's `.scratch/kit-jobs/<name>/`: `pid`, `pgid`, `command`, `cwd`,
  `started` (UTC), `log` (stdout and stderr together) and, written by a small wrapper when the
  command ends, `exit` (status) and `ended`. Prints the name, pid and log path, then
  `RESULT: ok bg <name> pid <pid>`. Names match `[a-z0-9][a-z0-9._-]*`. Refuses (exit 1) a name whose
  job is still alive; a finished job's folder is replaced.
- **`kit bg --list`**: one line per job: name, state (`running`, `exit N`, `died`), age, log path.
- **`kit bg --stop <name>`**: signals that job's process group only (SIGTERM, then SIGKILL after a
  grace period), never other processes; prints what it stopped.
- **`kit wait job <name> [--timeout D]`** in `kit.d/wait`: waits on the recorded pid/pgid and exit
  file (no `ps`, no `grep`; works after an app restart from the recorded files). When the job ends it
  prints only a short tail of the log (at most 15 lines) plus the job's own last `RESULT:` line, and
  exits with the job's status. A dead job with no `exit` record reports "died without exit status"
  (exit 1). A timeout while still running exits with a distinct status (e.g. 124) and says
  "still running", so a caller can simply wait again.
- Must not trip `scripts/agents/hooks/bash-guard.sh`: its `setsid` rule rejects arguments matching
  `server|vite|http.server|playwright`, and `pkill`/`pgrep -f` + `kill` are rejected. Add a test that
  the guard accepts the documented usage lines (`kit bg …`, `kit wait job …`, `kit bg --stop …`).
- Docs: one line each for `kit bg` and `kit wait job` in `docs/agents/agent-scripts.md#kit`;
  `docs/agents/runner.md#waiting` says: start long jobs with `kit bg <name> -- …`; Claude callers
  run `scripts/agents/kit wait job <name> --timeout 2h` with `run_in_background: true` → one notice
  instead of many 9-minute check-ins; never look up pids with `ps | grep`.

## Files

- `scripts/agents/kit.d/bg` (new)
- `scripts/agents/kit.d/wait`
- `scripts/agents/kit-lib.sh`, `scripts/agents/kit-lib.mjs` (job-folder helpers, if shared)
- `tests/kit-bg.test.ts` (new)
- `tests/kit-wait.test.ts`
- `tests/agent-hooks.test.ts` (guard accepts the documented usage)
- `docs/agents/agent-scripts.md`
- `docs/agents/runner.md`

## Done when

- `tests/kit-bg.test.ts`: start → files recorded, own process group, stdin is `/dev/null`; a live name
  is refused; `--list` states; `--stop` kills the job's group and leaves a sibling process alive;
  the job survives its parent shell exiting.
- `tests/kit-wait.test.ts`: `wait job` on a job that exits 0 and one that exits 3 (tail ≤ 15 lines,
  the job's RESULT line, same exit status); a job killed with SIGKILL before writing `exit`
  ("died without exit status"); timeout while running (distinct status, "still running"); a fresh
  `kit wait` process that only has the recorded files (simulated restart). Waits use conditions,
  not fixed sleeps.
- `tests/agent-hooks.test.ts`: the guard accepts the documented usage lines.
- The unit tests for the change pass (`scripts/agents/unit.sh tests/kit-bg.test.ts tests/kit-wait.test.ts tests/agent-hooks.test.ts`).
- Sol review via `kit review --ticket` with no open findings; landed via `kit pr --ticket` into
  `dev` with CI green.

## Done (2026-10-19)

- Added executable `kit bg`: detached `setsid` + `nohup` jobs with `/dev/null` stdin, an independent process group, combined logs and persistent command/cwd/time/pid/pgid/exit records. Live names are refused; finished records are replaced; list reports running, exit N or died with age and log path.
- Added group-only stop with a 2s TERM grace and KILL escalation, including TERM-resistant descendants. Additional process-start identity records protect against reused PIDs; a per-name `flock` serializes start/stop and releases if the launcher dies.
- Added `kit wait job`: fresh-process recovery from records, bounded-memory log scanning, at most 15 tail lines plus the last job RESULT, original exit status, dead-without-status failure and timeout 124 without stopping the job.
- Added lifecycle, argv/cwd/stdin, live-name, concurrent-name, process-group/sibling isolation, parent-exit, restart, exit 0/3, tail/RESULT, killed-job, timeout and guard coverage. New tests use temporary job roots and clean them up. Replaced one existing PID test's fixed lifetime with a condition-based release after its first observed scan.
- Updated the kit command index and runner waiting guidance, preserving the runner's documentation guard.
- Validation on Node 24.21.0: focused `scripts/agents/unit.sh tests/kit-bg.test.ts tests/kit-wait.test.ts tests/agent-hooks.test.ts` passed 272/272; `npm run check` and `npm run lint` passed; `npm test` passed 4640/4640; browser selection reported no affected specs. Unit runs use `NODE_OPTIONS=--test-reporter=spec` because the existing summary reads spec-reporter counts, while this terminal defaults to TAP.
- Evidence: `RESULT: ok doctor 7/7 checks passed`; focused run via the new commands: `RESULT: ok job ke-02-unit exit 0` (log `.scratch/unit/20261019T080916-40.log`); full suite: `RESULT: ok job ke-02-full exit 0` (log `.scratch/kit-jobs/ke-02-full/log`); `RESULT: ok specs none affected`. The unit wrapper itself emits counts and a log path, not a RESULT line.
- Initial validation used the shell's Node 22 and TAP reporter: its full run failed 8 assertions, including the runner length guard, an existing PID timing race and environment-sensitive tests. The doc/test fixes and supported Node/reporter rerun above passed all tests. An initial detached dogfood invocation was killed when the terminal sandbox's PID namespace closed; start and wait in one terminal invocation worked, and the parent-exit unit test passed.
- Deviation: none in command behavior. Per the builder contract, changes remain unstaged; independent review and landing belong to the runner. No commits, pushes, deploys, stashes or delegated agents.
- Review fixes for `59517ac5`: group liveness now requires a surviving start-time-pinned member, rather than only the wrapper PID. A recorded command supervisor survives wrapper death and remains until the command's group descendants finish. Start refuses a surviving group, list reports it as running, wait times out with 124 while it lives, and stop signals and escalates against that verified group while preserving unrelated processes.
- Interrupted-start recovery now distinguishes a missing-pid reservation from a live launch under the existing per-name lock. Each detached child waits for a pipe handoff after its identity is recorded; launcher death before the handoff cancels that child. Abandoned reservations can be reused without deleting records manually.
- Added temporary-directory regressions with condition-based waits: kill only the wrapper, let the command exit leaving an orphaned TERM-resistant descendant, refuse name replacement, list/wait correctly, stop with escalation, preserve a sibling, then reuse the name. Startup regressions interrupt both before spawn and after spawn but before identity/pid publication, verify launcher/lock exit and cancellation, then reuse the name through a fresh invocation.
- Fix validation: focused `scripts/agents/unit.sh tests/kit-bg.test.ts tests/kit-wait.test.ts tests/agent-hooks.test.ts` passed 275/275 on Node 24.21.0 (`NODE_OPTIONS=--test-reporter=spec`, log `.scratch/unit/20261019T082208-2.log`); `npm run check`, `npm run lint` and `git diff --check` passed. `RESULT: ok doctor 7/7 checks passed`; `RESULT: ok specs none affected` from `kit specs --affected --base HEAD`. The unit wrapper prints counts and a log path, with no RESULT line. Full `npm test` was not repeated because this fix brief explicitly prohibits the full unit suite; these results supersede the earlier validation counts for this fix.

- Second review fix for `b03fcd38`: both pinned wrappers install SIGTERM handlers before the launch handoff. They share one completion check against the original process group after child exit, keeping the supervisor alive while descendants finish and withholding `ended`/`exit` until the group has finished. A fresh stop can recover an interrupted stop without losing the group's identity.
- Added a condition-driven grace-period regression: a descendant acknowledges TERM, the asynchronous stop worker is paused before escalation, list stays running, wait returns 124, terminal records remain absent, and replacement is refused. After killing that stop invocation and observing lock release, replacement is still refused; a fresh stop kills the descendant while preserving a sibling. A second regression kills only the supervisor, verifies terminal records stay absent while its command lives, then releases the command and checks the published status and end time.
- Second-fix validation on Node 24.21.0: the new interrupted-stop regression first failed with premature exit 143 instead of timeout 124; after the fix, `NODE_OPTIONS=--test-reporter=spec scripts/agents/unit.sh tests/kit-bg.test.ts tests/kit-wait.test.ts tests/agent-hooks.test.ts` passed 277/277 (log `.scratch/unit/20261019T082825-2.log`). `npm run check`, `npm run lint` and `git diff --check` passed; `npm test` passed 4645/4645 through the named job `ke-02-second-full` (log `.scratch/kit-jobs/ke-02-second-full/log`). The final build contract explicitly required the full unit run, superseding this brief's earlier focused-only restriction; no full browser suite ran.
- Second-fix kit evidence: `RESULT: ok doctor 7/7 checks passed`; `RESULT: ok bg ke-02-second-full pid 23`; `RESULT: ok job ke-02-second-full exit 0`; `RESULT: ok specs none affected` (`kit specs --affected --base HEAD`). The focused unit wrapper emits counts and a log path, with no RESULT line. Changes remain unstaged; no commits, pushes, deploys, stashes or delegated agents.

- Third review fix for `a374c4cb`: wait opens the original log descriptor before verifying the captured job identity, rechecks identity after reading completion status, and streams only that descriptor. Name reuse during asynchronous log reading cannot pair replacement output with the original status. The descriptor closes on success, failure, timeout and interruption.
- Added two condition-controlled regressions that finish a job with exit 3, pause the waiter before log open or stream creation, replace the name with a distinct successful log/RESULT, then resume. Replacement before open is rejected; replacement after the descriptor is pinned returns only original output/RESULT and exit 3. Both tests reproduced the output/status mismatch before the fix.
- Third-fix validation on Node 24.21.0: focused `NODE_OPTIONS=--test-reporter=spec scripts/agents/unit.sh tests/kit-bg.test.ts tests/kit-wait.test.ts tests/agent-hooks.test.ts` passed 279/279 (log `.scratch/unit/20261019T083406-2.log`); `npm run check`, `npm run lint` and `git diff --check` passed; `npm test` passed 4647/4647 through `ke-02-third-full` (log `.scratch/kit-jobs/ke-02-third-full/log`). The final build contract requires the full unit run, superseding the earlier focused-only restriction; no browser specs were affected.
- Third-fix kit evidence: `RESULT: ok doctor 7/7 checks passed`; `RESULT: ok specs none affected` (`kit specs --affected --base HEAD`); `RESULT: ok bg ke-02-third-full pid 23`; `RESULT: ok job ke-02-third-full exit 0`. The focused unit wrapper emits counts and a log path, with no RESULT line. Changes remain unstaged; no commits, pushes, deploys, stashes or delegated agents. Independent review remains with the runner.

- Fourth review fix for `2ec398a5`: final log streaming receives the waiter's abort signal and owns the pinned descriptor until close. The waiter rechecks interruption and the captured job identity after each streamed-line await and before publishing the buffered tail, completion RESULT or exit status. Name replacement during streaming now fails without printing either job's output or the captured completion status.
- Added condition-controlled final-stream regressions for SIGINT and SIGTERM: hold the actual file stream open, deliver the signal through the kit front door, require termination within 2s with 130/143 and only the interrupted RESULT, and verify that the stream and descriptor both close. Both tests first failed against the previous implementation because the held stream did not terminate.
- Re-read every await in `wait job` and `bg`: polling rechecks interruption/identity, completion rechecks after streaming, wrapper completion rechecks the original group after child exit and group-drain waits, stop retains its original member proofs through grace/escalation, and start/stop reread state after acquiring the name lock. Added a TERM check after the wrapper handoff and preserved the launch identity across startup polling before reporting success. Two condition-controlled wrapper/command regressions verify that TERM before handoff prevents command execution and metadata writes, returning 143. Lock-release awaits perform no later job writes.
- Fourth-fix validation on Node 24.21.0: focused `NODE_OPTIONS=--test-reporter=spec scripts/agents/unit.sh tests/kit-bg.test.ts tests/kit-wait.test.ts tests/agent-hooks.test.ts` passed 283/283 (log `.scratch/unit/20261019T084102-2.log`); `npm run check`, `npm run lint` and `git diff --check` passed; `npm test` passed 4651/4651 through `ke-02-fourth-full` (log `.scratch/kit-jobs/ke-02-fourth-full/log`). The final build contract explicitly requires the full unit run, superseding the earlier focused-only restriction; no browser specs were affected.
- Fourth-fix kit evidence: `RESULT: ok doctor 7/7 checks passed`; `RESULT: ok specs none affected`; `RESULT: ok bg ke-02-fourth-full pid 23`; `RESULT: ok job ke-02-fourth-full exit 0`. The focused unit wrapper emits counts and a log path, with no RESULT line. Changes remain unstaged; no commits, pushes, deploys, stashes or delegated agents. Independent review remains with the runner.

Dogfood: [runner to fill; builder exercised named focused-unit and full-suite jobs above]
Review: [runner to fill]
