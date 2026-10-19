---
title: "kit unit --affected, and timing tests that pass under load"
type: task (AFK)
status: ready-for-agent
assignee:
blocked_by: [04-kit-slice]
builder: sol
---

## What

Today runners call `scripts/agents/unit.sh [files…]` (all `tests/*.test.ts` when no files are given,
summary by `unit-summary.mjs`, log in `.scratch/unit/`). There is no way to pick the unit files a
change reaches, so one runner ran the full suite (~4,370 tests) 31 times; and 6–7 timing tests fail at
random when the machine is busy, which sends runners into reruns.

- **`kit unit [--affected [--base REF]] [--list] [files…]`** (new `scripts/agents/kit.d/unit`; runs
  through `unit.sh`):
  - `files…`: as `unit.sh <files>`.
  - `--affected`: the diff against the merge-base with `REF` (default `origin/dev`) plus uncommitted
    and untracked files, as `kit specs --affected` collects them. Selects unit test files that changed,
    plus test files that import a changed file, transitively, within `tests/`, `src/`, `scripts/`
    (reuse `importsOf()` / `graphFile` from `scripts/agents/specs-affected.mjs`).
  - Prints each chosen file with its reason (`changed`, `imports <path>` / `via <path>`), like
    `kit specs --list`; `--list` prints and runs nothing.
  - Nothing maps (e.g. docs-only diff) → says so clearly, runs nothing, `RESULT: ok unit none affected`.
  - RESULT line: `ok|fail unit <pass>/<total> (<n> files) log <path>`.
- **Fix the timing-flaky tests** so they pass under load, with event or condition waits (process
  exit, a file appearing, a line in output, a promise), not longer sleeps:
  - `tests/agent-unit-timeout.test.ts`: "unit.sh enforces a per-test timeout and rejects an invalid
    ASE_UNIT_TIMEOUT_MS";
  - `tests/kit-size.test.ts`: the SIGINT and SIGTERM interruption cases (the `for (const signal of
    ["SIGINT", "SIGTERM"])` block);
  - `tests/kit-wait.test.ts`: "pid waits for a child exit through the front door …" and "pid timeout
    fails and idle status is rate limited";
  - `tests/media-controller.test.ts`: "a file brought back outside Media shows its kept records on the
    page at once";
  - `tests/agent-usage.test.ts` and `tests/agent-resume.test.ts`: the cases that fail under load
    (find them with the load runs below; the resume polling uses `ASE_RESUME_POLL_MS`).
  Each fix states in its commit message what the test now waits on.
- Docs: one line in `docs/agents/agent-scripts.md#kit`; `docs/agents/runner.md` (Build and tests):
  "while building, run `kit unit --affected`; `kit pr` runs the tier's full set".

## Files

- `scripts/agents/kit.d/unit` (new)
- `scripts/agents/unit.sh` (only if needed)
- `tests/kit-unit.test.ts` (new)
- `tests/agent-unit-timeout.test.ts`, `tests/kit-size.test.ts`, `tests/kit-wait.test.ts`,
  `tests/media-controller.test.ts`, `tests/agent-usage.test.ts`, `tests/agent-resume.test.ts`
- `docs/agents/agent-scripts.md`
- `docs/agents/runner.md`

## Done when

- `tests/kit-unit.test.ts` (temp repo): a changed test file; a changed `src/` file reached through two
  import hops; a changed `scripts/` helper; a docs-only diff (none affected); `--list` runs nothing;
  `--base`; reasons printed; exit status follows the tests.
- Load proof: start a CPU load generator on every core with `kit bg` (e.g.
  `kit bg load -- bash -c 'for i in $(seq "$(nproc)"); do yes > /dev/null & done; wait'`), then run
  the full unit suite (`scripts/agents/unit.sh`) at least 3 times, all green; stop the load with
  `kit bg --stop load`. Done lists the commands, the load average seen, and pass/fail counts per run.
- The unit tests for the change pass (`scripts/agents/unit.sh tests/kit-unit.test.ts` and the six
  fixed files).
- Sol review via `kit review --ticket` with no open findings; landed via `kit pr --ticket` into
  `dev` with CI green.
- Dogfood: built with `kit slice`; the Done section says where it helped or failed.
