---
label: wayfinder:map
title: Kit economy — ticket builds with far fewer tokens and steps
charted: 2026-10-19
tracker: local markdown (tickets in build/tickets/ with blocked_by and files lists)
---

## Destination

A runner builds, reviews and lands one ticket with far fewer tokens and steps than in the
Durable Object reduction build. The kit does the long, repetitive work (build, review, fix
rounds, waiting, landing) and hands the runner short digests instead of whole logs, results
files and screenshots. A runner starts one job (`kit slice`), waits once, and reports.
Nothing goes to `main` or production in this build.

## Retro facts (Durable Object reduction build, 30 tickets, 2026-10-17..19)

- Runner subagents re-read about 570M cached tokens in about 2,800 steps. Five runners
  (tickets 09, 10, 14, 15, 18) used almost half: their context grew to 250–340K because they
  fixed review findings themselves (up to 36 hand edits and 20 reruns of check/specs each).
- `kit pr` merged while its own review still had findings (ticket 06 → PR #37, ticket 27 →
  PR #55), and was relaunched up to 13 times per ticket.
- Runners waited 328+ times with `kit wait pid … --timeout 9m`, each time first finding the
  pid with `ps | grep`, which once tripped the bash-guard hook ("kill your own PID or process
  group").
- Agents opened full Playwright results and error-context files (up to 300 KB) to find one
  failing assertion.
- Screenshots were opened one by one at 2x (up to 300 KB each), often twice.
- The full unit suite (~4,370 tests) ran up to 31 times in one runner; 6–7 timing tests fail
  at random under load.
- Two `kit preview` wrangler deploys hung about 3 days with no timeout (the lead killed them
  on 2026-10-19).
- kit's own tests (the `kit doctor` / `agent.sh` cases with a fake brief
  `/tmp/kit-doctor-*/missing.md`) leave "failed 2" build-status folders in real worktrees'
  `.scratch/agent`.

## Notes

- This build's extra runner rules: [runner-extras.md](runner-extras.md). What the lead sends
  each runner: [runner-brief.md](runner-brief.md). The lead keeps dated notes in
  `lead-log.md` next to this map (started at the first wave).
- **kit layout** (unchanged from the [agent-kit map](../agent-kit/map.md#notes)): each new
  command is one executable in `scripts/agents/kit.d/` with a `# kit: <summary>` line, its own
  `--help`, one final `RESULT:` line, its own `tests/kit-<command>.test.ts`, and a one-line
  entry in [agent-scripts.md#kit](../../agents/agent-scripts.md#kit).
- **Landing order** is the ticket number. 01 and 02 have no blockers; 03 waits for 01 (the
  parser); 04 waits for 01, 02 and 03; 05–09 wait only for 04 and may run in parallel, each
  built with `kit slice` (dogfooding).
- **Shared files.** `docs/agents/agent-scripts.md` gets one line from every ticket;
  `docs/agents/runner.md` is edited by 02 (Waiting), 04 (Build/Review/Land), 05 and 07
  (Build and tests) and 06 (Screenshots). The open-findings parser written by 01 is used by 03
  and 04. `scripts/agents/agent-run.mjs` is changed by 03 (resume with a brief) and 09 (check
  the brief before creating the out dir). `tests/agent-resume.test.ts` is touched by 03 (new
  cases) and 07 (timing fix); `tests/kit-wait.test.ts` by 02 (`wait job`) and 07 (timing fix);
  `docs/wayfinder/kit-economy/runner-brief.md` by 04. 01 and 02 share only
  `agent-scripts.md`. These pairs are ordered by `blocked_by` except among 05–09, where the
  overlaps are separate lines in the two docs, which `kit pr`'s rebase resolves.
- **Open findings** (defined in ticket 01): every item under the review's `Defects` (Spec and
  Standards groups) and `Validation gaps`, except items that say "none"; `Optional nits`
  never count. An unreadable review counts as open (fail closed).

## Decisions so far

- `kit pr` never merges a PR whose covering review has open findings; only the lead can
  merge anyway, with `--waive "<reason>"`, which is recorded on the PR (ticket 01).
- Long jobs run under `kit bg <name>` and are awaited with `kit wait job <name>`; Claude
  callers wait with `run_in_background: true` and a long timeout (one notice, not many
  9-minute check-ins) (ticket 02).
- Review findings go back to the builder (`kit fix`, same model, CLI and effort); the runner
  never edits code for review findings (ticket 03).
- `kit slice` is the default ticket path: brief → build → commit → review → up to 3 fix
  rounds → `kit pr` (ticket 04).
- Runners read digests: `kit specs` failure digest (05), the `kit shots` contact sheet (06),
  `kit unit --affected` while building (07).
- Every network step of `kit preview` has a timeout (08); kit tests leave no trace in real
  worktrees (09).

## Out of scope

- Production, `main`, the release PR and preview deploys by runners (the lead deploys).
- App code (`src/`, `worker/`, `shared/`): this build changes only `scripts/agents/`, its tests
  and agent docs, plus the timing-flaky unit tests named in ticket 07.
- New npm packages.
