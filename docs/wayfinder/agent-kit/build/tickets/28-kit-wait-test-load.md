---
title: "kit wait tests: deterministic under load"
type: task (AFK)
status: closed
assignee: ak-28
blocked_by: [04-kit-wait]
builder: sol
---

## What

`tests/kit-wait.test.ts` failed once during a full unit run on a busy machine and
passed 24/24 alone (found by ak-26). It depends on real time.

- Find the time-dependent test(s); make them wait on observable events (process exit,
  file written, a fake clock or an injectable poll interval) instead of wall-clock
  margins. No raised timeouts, no fixed sleeps.
- If `kit.d/wait` needs a test seam (for example `KIT_WAIT_POLL_MS` or a quiet-period
  override), add it there.

## Files

- `tests/kit-wait.test.ts`
- `scripts/agents/kit.d/wait` (test seam only, if needed)

## Done when

- 10 runs of the file beside a full `scripts/agents/unit.sh` run all pass.
- Sol review saved under the main root `.scratch/reviews/`; landed on `dev` with CI green.

## Done (2026-10-16)

- **Cause.** The producer close/append test closed its file 200 ms after "ready", but under load the `kit wait` Node process took longer than that to start, so it never saw the writer holding the file and finished on its 50 ms quiet period before `second` was written (the documented "writer never seen" limit; the test raced, not the script).
- **Reproduced.** 20 runs of the file beside a full `scripts/agents/unit.sh` (load average about 41): 5 failed, all in "output waits for a producer that closes the file and appends again before exiting" (finished after 131–248 ms with only `first`). No other test in the file failed.
- **Fix (tests only; `kit.d/wait` unchanged).** New helpers `nextLine` (next complete stdout line matching a pattern) and `watchOutput` (runs `wait output` with `KIT_WAIT_STATUS_MS=1`, so every `waiting ` line follows a full file + /proc scan). The two writer tests drive their child over stdin and step on those lines: producer test holds → scan → close → scan while closed and alive → append and exit; size-change test holds the file open, appends after a scan, reports its pre-append `Date.now()`, and asserts the wait finished at least 300 ms later and the child exited 0 (awaited `exit` event instead of a synchronous `exitCode` read). Neither wait has a `--timeout` to race; the unit runner's timeout catches hangs.
- **Commits.** b896590b (built by the runner, Claude, to land fast at the lead's request; Sol's build was stopped before it changed anything), plus this close-out.
- **Tests.** `tests/kit-wait.test.ts` 24/24 in 10 of 10 runs beside two full `unit.sh` runs; full suite 3,852 pass (second load run: 1 failure in `tests/kit-preview.test.ts`, "an old live bundle fails within the verification deadline", a separate time-based test outside this ticket). `npm run check` and `npm run lint` pass.
- **Review.** Sol (`kit review`): no defects. One validation gap rejected for this ticket: the size-change lower bound is taken when the test process resumes, so under extreme load a wait that never restarts its quiet period could still pass; it never fails a correct wait, and closing it needs a fake clock seam in `kit.d/wait` (follow-up). Remaining wall-clock deadlines in the pid/regex/CI tests (`--timeout 2`) were not reproduced as failures and were left as they were. Evidence: `/home/ubulex/Projects/native-site-editor/.scratch/reviews/ak-28/20261016T140836Z`.
