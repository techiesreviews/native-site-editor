---
title: "kit slice: one command runs a ticket from brief to merged PR"
type: task (AFK)
status: closed
assignee: ke-04
blocked_by: [01-kit-pr-stops-on-findings, 02-kit-bg-jobs, 03-kit-fix]
builder: sol
---

## What

Today a runner does every step of [runner.md](../../../../agents/runner.md) by hand (brief, build,
commit, review, fixes, close, `kit pr`), relaunching jobs and re-reading output each time.
`kit slice` chains the kit commands from tickets 01–03 so a runner starts one job and waits once.

- **`kit slice --ticket <path> --builder sol [--effort high] [--rounds 3] [--no-pr]`** (new
  `scripts/agents/kit.d/slice`), run in the current worktree. Phases, each logged with one status line
  (`slice: <phase> ok|fail …`):
  1. **brief**: writes `.scratch/agent-brief.md` from the ticket: ticket path, its Files list, its
     Done when, and "append `## Done (YYYY-MM-DD)` (behaviour, commits, tests, review decisions),
     set `status: closed`, `assignee: <owner>`".
  2. **build**: `agent.sh build "$PWD" .scratch/agent-brief.md --model <builder model> --effort <effort>`
     (`--builder sol` → `gpt-6.1-sol`; default effort `high`); records the run's out dir.
  3. **commit**: commits the builder's unstaged work (message: ticket title; the builder's
     Co-Authored-By line). Nothing to commit → fail.
  4. **review**: `kit review --ticket <path>`.
  5. **fix**: while open findings remain, up to `--rounds` (default 3) `kit fix --ticket <path>` rounds.
  6. **pr**: `kit pr --ticket <path>` (never `--waive`); skipped with `--no-pr`.
  Final line `RESULT: ok slice <ticket> PR #N <sha>` (with `--no-pr`: `ok slice <ticket> reviewed clean
  <sha>`) or `RESULT: fail slice <phase>: <reason>`. Findings left after the last round → the PR is
  opened but left unmerged (`kit pr` refuses per ticket 01), the open findings are listed (≤ 15 lines),
  and the line reads `RESULT: fail slice fix: <n> open findings after 3 rounds (<result.md>)`.
- **Rerunnable**: a state file under `.scratch/kit-slice/<ticket-slug>/state.json` records finished
  phases, the build out dir, review paths, round count and PR number; a rerun resumes from the
  first unfinished phase (a HEAD that moved since the last review reruns review). Each phase's
  output goes to a log file in that folder; the console gets only the status lines and, on failure,
  at most 15 lines from the failing phase.
- **How runners use it**: start once as
  `scripts/agents/kit bg slice-<NN> -- scripts/agents/kit slice --ticket <path> --builder sol`,
  then `scripts/agents/kit wait job slice-<NN> --timeout 2h` (Claude: `run_in_background: true`),
  and report.
- **Docs**: `docs/agents/runner.md` Build/Review/Land sections make `kit slice` (under `kit bg`)
  the default path and keep the manual steps as the fallback; one line in
  `docs/agents/agent-scripts.md#kit`; the runner template. No generic runner-brief template exists
  today: briefs live per build (`docs/wayfinder/agent-kit/runner-brief.md`,
  `docs/wayfinder/kit-economy/runner-brief.md`) and `docs/agents/runner-extras-template.md` is the
  only template. Add the `kit slice` default to `runner-extras-template.md` (its Builder line) and to
  this build's `runner-brief.md` step 3 if it no longer matches.

## Files

- `scripts/agents/kit.d/slice` (new)
- `tests/kit-slice.test.ts` (new; fake `agent.sh`, `kit review`, `kit fix`, `kit pr`)
- `docs/agents/runner.md`
- `docs/agents/agent-scripts.md`
- `docs/agents/runner-extras-template.md`
- `docs/wayfinder/kit-economy/runner-brief.md`

## Done when

- `tests/kit-slice.test.ts` with fake commands (env overrides for `agent.sh` and the kit) proves:
  the brief holds ticket path, Files, Done when and the close instruction; the phase order and
  status lines; clean first review → `kit pr` → `ok slice … PR #N <sha>`; findings fixed in round 2;
  findings left after `--rounds` → no merge, findings listed, `fail slice fix: …`; `--no-pr`;
  a rerun after a failure in each phase resumes at that phase and does not rebuild; `--waive` is never
  passed; a failing phase shows at most 15 lines.
- The unit tests for the change pass (`scripts/agents/unit.sh tests/kit-slice.test.ts`).
- Sol review via `kit review --ticket` with no open findings; landed via `kit pr --ticket` into
  `dev` with CI green.


## Done (2026-10-19)

- Behaviour: added executable `kit slice` with help, model selection, generated ticket brief,
  build, commit, review, bounded fix rounds and PR phases. Saved state resumes unfinished phases,
  re-reviews moved HEADs, records builder and review paths, round count and PR number, and retains
  phase logs. Console output is phase status lines, a single final RESULT, and at most 15 failure
  lines. `--no-pr` stops reviewed clean; exhausted findings open/update a PR with `--no-merge`,
  list the findings and fail without passing `--waive`.
- Shared helper: extended the existing `scripts/agents/kit-lib.mjs` with `commitBuilderWork` and
  model author mapping, used by both slice and fix. Both use the worktree's normal index and
  commit hooks, with a temporary detached HEAD for safe commit creation and expected-old-SHA
  publication to only the captured branch. Git owns reference locks; no manual index/HEAD locks.
  Scope and parent checks reject stale scope, empty work and hooks that move HEAD.
- Tests: `tests/kit-slice.test.ts` fakes agent/review/fix/pr commands through executable env
  overrides and exercises briefs, ordering, success, fix rounds, exhaustion, no-PR, retries of
  every phase, saved evidence, changed HEAD and bounded failure output. `tests/kit-commit.test.ts`
  uses temporary Git repositories and per-test hooks for commits, credits, wrong branch/HEAD,
  empty work, hook interference and absence of leftover locks. Adapted the two lock-design tests
  in `tests/kit-fix.test.ts`; retained held-builder branch/HEAD coverage.
- Validation: `scripts/agents/unit.sh tests/kit-slice.test.ts tests/kit-fix.test.ts
  tests/kit-commit.test.ts` passed 40, failed 0 (log:
  `.scratch/unit/20261019T092059-2.log`). Two earlier runs passed 38/38; the expanded coverage
  initially passed 39 and failed one assertion expecting commit output from the fake fix command;
  corrected it to assert the actual saved RESULT output. `npm run check` and `npm run lint`
  passed. Full `npm test` was excluded by the brief's focused-unit restriction.
  `kit specs --affected`: `RESULT: ok specs none affected`.
- Docs: runner Build/Review/Land, the kit command index, runner extras template and this build's
  runner brief now describe `kit slice` as the default and retain the manual fallback.
- Dogfood: `kit doctor`: `RESULT: ok doctor 7/7 checks passed`; `kit specs --affected` reported none affected.
  Slice/fix orchestration was exercised against isolated fake commands, with real temporary Git
  commits and hooks. No build or review workers were launched, per the builder brief.
- Commits: _runner to fill; implementation left unstaged_.
- Review decisions and evidence: _runner to fill after review_.
- Landed PR / CI: _runner to fill_.


### Review fixes (2026-10-19)

- Exhaustion now accepts only the expected review-findings refusal identifying an opened PR,
  or a successful `opened` RESULT. Other failures surface as `fail slice pr` with the PR command's
  reason and at most 15 PR log lines, instead of being hidden behind exhausted findings.
- Queued PRs persist their PR number and reviewed head before waiting. The slice queries merge
  state until merged, reports the actual merge SHA, rejects a changed PR head, and resumes the
  same wait after lookup errors or timeouts without invoking `kit pr` again.
- The P1 publication finding required changing the initial no-private-Git-context design:
  normal commits can publish onto a branch switched during a pre-commit hook before a later
  scope check catches it. The shared helper now creates the commit against a temporary detached
  HEAD using the normal index and hooks, rechecks scope, and compare-and-swaps only the captured
  branch against the expected old SHA. The context is removed in `finally`; it creates no manual
  Git lock files and no private index. A late switch cannot redirect publication to another branch.
- Regression coverage: held pre-commit hook with another branch at the same HEAD, no foreign
  branch commit and no review; linked worktree isolation; switch immediately before publication;
  exhausted-round PR creation failure and bounded digest; queue success and retry after lookup
  error or timeout; changed queued PR head; a rerun after successful merge does not reopen the PR.
- Validation: focused unit files passed 49, failed 0 twice; final log
  `.scratch/unit/20261019T093151-2.log`. Shared-helper-only run passed 13, failed 0.
  Earlier runs (20/26, 20/26, helper 10/1, 21/28 pass/fail) exposed unsupported combinations of
  HEAD verification and branch updates in a single Git transaction; replaced that approach with
  detached commit creation and expected-old-SHA publication to the named branch. `npm run check`,
  `npm run lint`, and `git diff --check` passed. Kit results: `RESULT: ok doctor 7/7 checks passed`;
  `RESULT: ok specs none affected`. No full unit suite, live review, push or merge was run.
- Declined: none.
