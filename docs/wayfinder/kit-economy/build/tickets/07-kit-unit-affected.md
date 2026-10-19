---
title: "kit unit --affected, and timing tests that pass under load"
type: task (AFK)
status: closed
assignee: ke-07
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
- `scripts/agents/unit.sh`, `scripts/agents/unit-summary.mjs` (count parsing, lead addition a)
- `scripts/agents/agent-run.mjs` and its test in `tests/agent-scripts.test.ts` (build contract, lead addition b)
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
- Lead addition a: `unit.sh` no longer prints "unit report lacks pass/fail counts" when the log has the counts; a unit test feeds a real-shaped log and checks the counts.
- Lead addition b: the build contract in `agent-run.mjs` names focused unit files (`kit unit --affected`), `npm run check` when types moved, and leaves the full tier to `kit pr`; its test checks the new wording and that `npm test` is gone.
- Dogfood: built with `kit slice`; the Done section says where it helped or failed.

## Lead additions (2026-10-19)

a. `scripts/agents/unit.sh` prints a false "problem: unit report lacks pass/fail counts"
   (thrown in `scripts/agents/unit-summary.mjs`) even when the log has the counts; three runners
   saw it today. Fix the count parsing so every real node test report shape is read, and test it.
b. The build contract in `scripts/agents/agent-run.mjs` (`buildContract`, the build footer) tells
   every builder to run the whole `npm test`; that overrode briefs and ran ~4,370 tests every fix
   round. Change it to: run the focused unit files for the change (`scripts/agents/kit unit
   --affected` once this ticket's command exists, else `scripts/agents/unit.sh <files>`) and
   `npm run check` when types moved; `kit pr` runs the full tier. Update its test.

## Done (2026-10-19)

- Behaviour: added executable `kit unit [files…] [--affected [--base REF]] [--list]`.
  Affected selection combines merge-base, staged, unstaged and untracked changes, follows
  imports transitively (including surviving importers of deleted modules), and prints changed,
  imports or via reasons. Docs-only selections run nothing; test status, counts, file count and
  log path appear in the final RESULT. `unit.sh` pins the spec reporter; count parsing accepts
  spec and TAP reports, ANSI colours, whitespace and CRLF. The build footer now requests
  focused units and type checks when types moved, leaving the full tier to `kit pr`.
- Timing checks now wait on the timed-out child exiting and reporting its timeout rather than
  asserting total startup speed; size interruptions wait for a file written after the signal
  handler is installed; pid waits release a held child and await its close, while timeout
  checks hold the child open until teardown; Media waits for `refreshDescriptions`; resume
  polling accepts only complete JSONL call records. The first focused load run exposed an
  empty/partially written calls file (156 pass, 1 fail); the JSONL fix resolved it.
  `agent-usage.test.ts` needed no change: it passed the focused checks and all three load runs.
- Validation: `scripts/agents/kit doctor` returned `RESULT: ok doctor 7/7 checks passed`.
  `scripts/agents/unit.sh tests/kit-unit.test.ts` passed 7/0
  (`.scratch/unit/20261019T102122-3.log`). The six named timing/usage/resume files plus
  `tests/agent-scripts.test.ts` passed 150/0 (`.scratch/unit/20261019T102151-948.log`).
  `scripts/agents/kit unit --affected` returned
  `RESULT: ok unit 169/169 (8 files) log .scratch/unit/20261019T102207-5874.log`.
  `npm run check`, `npm run lint` and `npm test` passed; npm test reported 4753/0
  (`.scratch/ke07-npm-test.log`). `scripts/agents/kit specs --affected` returned
  `RESULT: ok specs none affected`. `--list` selected eight unit files and ran nothing.
- Load proof: started 16 CPU workers with
  `scripts/agents/kit bg load -- bash -c 'for i in $(seq "$(nproc)"); do yes > /dev/null & done; wait'`,
  ran `scripts/agents/unit.sh` three times, and stopped the generator with
  `scripts/agents/kit bg --stop load` (`RESULT: ok bg stop load pgid 23`).
  `/proc/loadavg` one-minute readings before runs were 37.82, 57.32 and 45.91; a reading
  during run 1 reached 76.10. Results: run 1, 4753 pass/0 fail
  (`.scratch/unit/20261019T101302-37.log`); run 2, 4753/0
  (`.scratch/unit/20261019T101647-46478.log`); run 3, 4753/0
  (`.scratch/unit/20261019T101840-89017.log`). All had zero cancellations and skips.
- Commits and review decisions: changes are intentionally unstaged; this builder made no
  commits or pushes and started no agents. Independent Sol review via `kit review --ticket`,
  commits, `kit pr --ticket` and CI/landing into `dev` remain the calling runner's phases,
  as required by the build contract. No independent review or landing is claimed here.
- Dogfood: the calling `kit slice` generated `.scratch/agent-brief.md`, saved progress in
  `.scratch/kit-slice/07-kit-unit-affected/state.json`, and invoked this builder. Its persisted
  brief/build state made ownership and the unstaged handoff clear. Kit background jobs must
  stay inside the owning shell session in this sandbox: an initial detached focused job died
  when that shell exited; the successful load proof kept the shell alive and stopped its load
  group on exit. The old footer still requested the full npm test; this change corrects future
  builder contracts. `kit unit --affected` also selected the unchanged `kit-review.test.ts`
  importer, demonstrating the focused selection during this build.
