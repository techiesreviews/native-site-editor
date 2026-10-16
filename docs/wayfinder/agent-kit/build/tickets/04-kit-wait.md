---
title: "kit wait: the one way to wait; the guard blocks hand-rolled loops"
type: task (AFK)
status: open
assignee:
blocked_by: [01-kit-front-door]
builder: sol
---

## What

- Follow the kit layout in [the map](../../map.md#notes): one executable in `scripts/agents/kit.d/`, a `# kit: <summary>` line, `--help`, Node 24 and owner from `kit-lib`, one final `RESULT:` line, own test file.
- `kit wait pid <pid> [--timeout 30m]`: waits for the process to exit (poll `/proc/<pid>`, never `pgrep -f`), prints elapsed time.
- `kit wait output <file> [--until <regex>] [--timeout]`: waits for a task-output file to stop growing and its process to end, or for a regex; prints the last 20 lines once.
- `kit wait ci [--branch dev | --pr N | --sha S] [--timeout 30m]`: waits for the GitHub checks of that head; a "cancelled" run whose head is superseded reports "superseded by <sha>" and keeps waiting for the newer one; prints failed steps and the last 20 log lines on failure (reuse `ci-summary.mjs`).
- One status line at most every 60 s; one final `RESULT:`.
- bash-guard: reject `pgrep -f` anywhere, and `sleep` inside `until`/`while`/`for` loops; the block message names `kit wait`. Keep every existing allowed case allowed; add cases to `tests/agent-hooks.test.ts`.

## Files

- `scripts/agents/kit.d/wait`
- `scripts/agents/hooks/bash-guard.sh`
- `tests/agent-hooks.test.ts`
- `tests/kit-wait.test.ts`

## Done when

- Unit tests cover pid exit, timeout, regex match, superseded CI runs (fake `gh` on PATH), and the new guard rejections plus look-alikes that stay allowed (`sleep 1` alone, the word "pgrep" in a commit message).
- Sol review saved under the main root `.scratch/reviews/`; landed on `dev` with CI green.
