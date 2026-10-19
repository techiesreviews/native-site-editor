---
title: "kit bg: background jobs by name, and kit wait job"
type: task (AFK)
status: ready-for-agent
assignee:
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
