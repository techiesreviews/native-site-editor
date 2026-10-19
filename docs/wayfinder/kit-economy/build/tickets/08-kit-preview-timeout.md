---
title: "kit preview: a timeout on every deploy step"
type: task (AFK)
status: ready-for-agent
assignee:
blocked_by: [04-kit-slice]
builder: sol
---

## What

Today `kit preview` (`scripts/agents/kit.d/preview`) runs its steps through `run()`, each child in its
own process group (`detached: true`), holding `/tmp/ase-deploy-preview.lock` (npm inherits the lock
fd). Only the lock wait (`flock -w 900`) and the live-bundle check (`KIT_PREVIEW_VERIFY_MS`, default
120 s) are bounded; `git fetch origin dev`, the worktree git steps and `npm run deploy:preview`
(wrangler) are not. Two wrangler deploys hung about 3 days.

- Every git, npm/wrangler and network step gets a deadline: default a few minutes (e.g. 2 min for git
  steps, 10 min for the deploy), one override `ASE_PREVIEW_TIMEOUT` (duration `s/m/h` or seconds,
  validated like other kit durations; invalid → exit 2).
- On expiry: kill the step's whole process group (SIGTERM, then SIGKILL after a short grace),
  wait for the group leader so npm's lock fd closes, remove the temp dir that step created
  (the deploy worktree's `dist/` and wrangler's `.wrangler/tmp`, so the cached
  `.scratch/preview-deploy` worktree stays reusable), release the lock, and print
  `RESULT: fail preview deploy timed out after <D> (killed pgid N)` (the step name in place of
  `deploy` for git steps). Exit 1.
- `--help` names `ASE_PREVIEW_TIMEOUT`; the `kit preview` line in `docs/agents/agent-scripts.md#kit`
  mentions the timeout.

## Files

- `scripts/agents/kit.d/preview`
- `tests/kit-preview.test.ts`
- `docs/agents/agent-scripts.md`

## Done when

- `tests/kit-preview.test.ts` with a fake `npm`/wrangler that hangs (and spawns a child that also
  hangs): the run ends within the short test timeout, the whole group is gone (child too), the lock can
  be taken again at once, `dist/` and the temp dir are removed, and the RESULT line matches; a hanging
  fake `git fetch` times out the same way; an invalid `ASE_PREVIEW_TIMEOUT` exits 2; the existing
  deploy and verify tests still pass.
- Done notes that the two hung deploys (pids 3167057, 3167195) were already killed by the lead on
  2026-10-19; no runner deploys.
- The unit tests for the change pass (`scripts/agents/unit.sh tests/kit-preview.test.ts`).
- Sol review via `kit review --ticket` with no open findings; landed via `kit pr --ticket` into
  `dev` with CI green.
- Dogfood: built with `kit slice`; the Done section says where it helped or failed.
