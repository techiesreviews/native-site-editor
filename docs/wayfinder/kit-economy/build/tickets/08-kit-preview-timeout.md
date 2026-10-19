---
title: "kit preview: a timeout on every deploy step"
type: task (AFK)
status: closed
assignee: ke-08
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

## Done (2026-10-19)

- Behaviour: git steps (including root/owner discovery) have a 2m deadline and deploy has a
  10m deadline. `ASE_PREVIEW_TIMEOUT` accepts positive integer seconds or `s/m/h`, capped at
  2147483 seconds; invalid values exit 2 before taking the lock. It also bounds network
  verification, which retains its existing live/built bundle result on failure.
- On a subprocess deadline, signal the whole group with SIGTERM, then SIGKILL after 500ms;
  reap the leader and wait for remaining live members before removing `dist/` and
  `.wrangler/tmp/` and releasing the lock. Preserve the cached worktree and `node_modules`.
  Report `RESULT: fail preview <step> timed out after <duration> (killed pgid <pid>)`.
- Tests: `scripts/agents/unit.sh tests/kit-preview.test.ts` passed 24/24. Coverage includes
  hanging fake npm/wrangler and child (both ignoring TERM, or the leader exiting first),
  hanging git fetch/checkout, immediate lock acquisition, cleanup and worktree reuse,
  invalid durations, and a hanging HTTP verification. Existing deploy/verify tests pass.
  `npm run check`, `npm test` (4757/4757), and `npm run lint` passed.
- Kit evidence: `RESULT: ok doctor 7/7 checks passed`; `RESULT: ok specs none affected`;
  `RESULT: ok job ke08-check exit 0`; `RESULT: ok job ke08-test exit 0`;
  `RESULT: ok job ke08-lint exit 0`; `RESULT: ok job ke08-focused exit 0`.
  Logs: `.scratch/kit-jobs/ke08-{check,test,lint,focused}/log`;
  focused unit log: `.scratch/unit/20261019T104357-39.log`.
- Operations: the lead already killed the two hung deploys, pids 3167057 and 3167195,
  on 2026-10-19. This builder ran no preview deploys; tests use isolated fake tools.
- Commits: none; all changes are unstaged for the runner, as required by the build contract.
- Review decisions: local diff inspection found no remaining defects. Independent Sol/medium
  `kit review --ticket` and `kit pr --ticket` into `dev` with green CI remain for the runner;
  they were not run because this build contract prohibits agents, commits and pushes.
- Dogfood: inspected `kit slice --help`; building with `kit slice` would launch a builder,
  commit and land, conflicting with this run's contract. Used `kit bg` and `kit wait job`
  for validation instead. Detached jobs died without an exit status when their terminal
  calls closed; keeping `kit wait job` attached to the launch terminal succeeded.
