---
title: "kit wait: the one way to wait; the guard blocks hand-rolled loops"
type: task (AFK)
status: closed
assignee: ak-04
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

## Done (2026-10-16)

- **Behaviour.** `kit wait pid` polls `/proc/<pid>` (zombies count as exited). `kit wait output` finishes on an `--until` regex, or when every process seen writing the file (found through `/proc/*/fd` + `fdinfo` write flags, never `pgrep`) has exited and the size stayed unchanged for `--quiet` (5s); it prints the last 20 lines once. A writer never seen holding the file is covered only by the quiet period (stated in `--help`). `kit wait ci` imports `summarizeRuns`, `failingSteps` and `latestWorkflowRuns` from `ci-summary.mjs` (unchanged); it stays on its starting head, and only a cancelled run on a head that has since moved prints `superseded by <sha7>` and follows the new head. Failures print failed steps and the last 20 failed-log lines. One status line per 60 s at most; one final `RESULT:`.
- **Guard.** `bash-guard.sh` tracks loop depth (`while`/`until`/`for`/`select` to `done`, including conditions, `$(…)`, `sh -c`, `eval`, shell heredocs, arithmetic `for ((…))` headers; `case` patterns such as `while)`/`done)` are skipped) and rejects `sleep` and `pgrep -f` inside loops with "wait with scripts/agents/kit wait (pid, output or ci), not a sleep or pgrep -f loop".
- **Scope decision.** The ticket says "reject `pgrep -f` anywhere" but also "keep every existing allowed case allowed"; the allowed list holds bare `pgrep -f vite`, `pgrep -f vite; kill 1234` and `pgrep -f vite || kill 1234`. Kept those allowed: `pgrep -f` is rejected inside loops (and, as before, when piped into kill). Retry loops such as `for i in 1 2 3; do git push && break; sleep 2; done` are now blocked by the loop rule.
- **Known limit.** The front door only treats `--help` as the first argument, so `kit wait pid --help` gains a `RESULT: ok wait finished` line (direct help is clean; `scripts/agents/kit` is outside this ticket).
- **Commits.** acba4085 (built by Sol; branch-mode head switching narrowed by the runner), 681897a4 (review fixes), plus this close-out.
- **Tests.** `tests/kit-wait.test.ts` (24 tests: help, pid exit/timeout/absent/usage, output regex/quiet/held writer/closing-and-reopening producer/timeout, CI green/failed/superseded/moved-without-cancel/PR/SHA/pending/gh error with a fake `gh`, status rate limit, SIGINT/SIGTERM). `tests/agent-hooks.test.ts`: 30 new blocked and 28 new allowed cases; every existing case unchanged. `npm run check`, `npm run lint`, full `scripts/agents/unit.sh` 3,595 pass before review fixes; focused files pass after.
- **Review.** Sol review 1: 2 defects (case patterns changed loop depth; "no open writer" treated as "producer exited"), both fixed with tests. Re-review: 3 findings rejected: `(( while += 1 ))` needs a variable named `while`/`sleep`, and skipping `((…))` as arithmetic would hide `((git stash pop); true)`, which bash runs as nested subshells; extglob `@(a|while))` is a syntax error unless extglob is on before parsing (off for agent commands); a producer never seen holding the file cannot be identified without guessing (documented). Saved at `/home/ubulex/Projects/native-site-editor/.scratch/reviews/ak-04/`.
