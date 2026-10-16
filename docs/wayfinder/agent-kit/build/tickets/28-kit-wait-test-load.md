---
title: "kit wait tests: deterministic under load"
type: task (AFK)
status: open
assignee:
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
