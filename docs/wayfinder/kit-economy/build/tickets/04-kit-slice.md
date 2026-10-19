---
title: "kit slice: one command runs a ticket from brief to merged PR"
type: task (AFK)
status: ready-for-agent
assignee:
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
