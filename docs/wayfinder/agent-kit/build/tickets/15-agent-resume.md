---
title: "agent.sh: pid/status file and --resume after an app restart"
type: task (AFK)
status: closed
assignee: ak-15
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

## Done (2026-10-16)

- **Behavior.** Every `agent.sh` run writes `<out>/status.json` atomically: runner pid, CLI process group, kind/model/cli/effort/worktree/brief/out (plus base/commit), started/updated, state (running/done/failed/timeout/interrupted), exit code, session id, resume count. The Codex id comes from the `session id:` line as it streams. Fresh Claude runs get `--session-id <uuid>` up front, so a run killed before its final JSON is still resumable. SIGHUP (and SIGINT/SIGTERM) kills the CLI group and records `interrupted`. Status is written before any output, so a dead terminal cannot lose it.
- **`agent.sh --resume <out-dir>`** waits on a live runner (pid checked against `/proc/<pid>/cmdline`) and returns its result. Otherwise it continues the session: `codex exec resume` with `-c sandbox_mode="workspace-write"`, network and `writable_roots=[git common dir]` (the CLI has no `-s`/`-C`/`--add-dir`), or `claude -p … --resume <id>`, with the prompt "Continue where you stopped; the brief is unchanged." It appends to run.log (with a `--- resume <time> ---` marker) and out.md. Concurrent callers race on `resume-claim-<n>.<attempt>` hard links: one restarts, the rest follow it to its exit code. Fresh-run args, output paths and the review retry are unchanged.
- **Commits.** `e236c0ea` (Sol build), `1dabbc8e` (review fixes), `7e0decc5` (re-review fixes).
- **Tests.** New `tests/agent-resume.test.ts` uses fake CLIs only: lifecycle, failed, timeout, SIGHUP/SIGINT/SIGTERM interrupted with the group killed, dead codex/claude resume, waiting on a live runner, an unrelated pid, done, a missing session, a Claude kill before its final JSON, two concurrent callers, a failing replacement and an orphaned claim. Check, `unit.sh` 3863 pass / 0 fail, lint.
- **Review.** Sol review `.scratch/reviews/ak-15/20261016T140108Z`. Fixed: the concurrent-resume race and Claude losing its session when killed. Rejected: resuming Codex reviews, because that would keep a private Codex home holding login credentials between runs, and reruns are cheap (refused with a clear message). Re-review `.scratch/reviews/ak-15/20261016T140657Z`. Fixed: orphaned claims and waiters restarting after a failed replacement.
- **Limits.** Not run against the real CLIs.
