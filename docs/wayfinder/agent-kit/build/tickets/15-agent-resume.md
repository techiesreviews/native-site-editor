---
title: "agent.sh: pid/status file and --resume after an app restart"
type: task (AFK)
status: open
assignee:
blocked_by: [03-kit-doctor, 05-kit-review]
builder: sol
---

## What

- Each invocation writes `<out>/status.json`: pid, pgid, kind, model, cli, worktree, brief path, started, state (running/done/failed/timeout), exit code, and the CLI session id once known (Codex: the `session id:` log line; Claude: `session_id` from the JSON).
- `agent.sh --resume <out-dir>`: if the recorded pid is alive, wait for it; otherwise continue the session (`codex exec resume <id>` with the same sandbox flags / `claude -p --resume <id>`) with a short "continue where you stopped; the brief is unchanged" prompt, appending to the same run.log and out.md.
- A run killed with the app (SIGHUP) records state `interrupted`.

## Files

- `scripts/agents/agent-run.mjs`
- `scripts/agents/sol-run.mjs`
- `scripts/agents/agent.sh`
- `tests/agent-resume.test.ts`

## Done when

- Unit tests with fake CLIs: status file lifecycle, resume of a dead run, waiting on a live one, interrupted state.
- Sol review saved under the main root `.scratch/reviews/`; landed on `dev` with CI green.
