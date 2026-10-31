---
title: "The factory runs on T3 Code: a slice's build, review, second look and fix are T3 threads that wake their runner; PRs are watched, not polled; the kit keeps the rules and gates, and the headless path stays as the fallback outside T3"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [84-factory-brief-and-go]
---

## Goal

Lex (2026-10-31): first "I would like to utilize t3 code native way for subagents etc, so check what part of the factory could be run with that tool", then "Replace the parts of the factory to use t3 code native way".

Today `kit slice` runs its builder, reviewers and fixer as hidden headless `claude -p` / CLI processes (`agent-run.mjs`) inside a systemd unit. Its lead child has to wait on that unit, and keeps ending its turn too early (am-21, ke-72, am-24 twice on 2026-10-30/31). T3 can run every one of those agents as a visible thread, on any of its providers. It wakes the parent when a child finishes, watches PRs, and runs schedules. So inside T3 these parts move to T3, and the kit keeps what must also work outside T3 (GitHub CI, Codex CLI, another computer).

## Split (lead, 2026-10-31, from `orchestrator_capabilities` and the T3 tool list)

| Factory part | Inside T3 | Outside T3 (fallback, unchanged) |
|---|---|---|
| Start an agent (builder, reviewer, fixer, helper) | `delegate_task` child thread, own worktree when it edits; Claude, Codex | headless run in `agent-run.mjs` |
| Second look | `delegate_task` child on Grok (weekly count still applies) or OpenCode's free DeepSeek, read-only | Grok / OpenCode CLI wrappers |
| Wait for an agent | none: T3 wakes the runner when the child finishes | `kit wait` |
| Wait for CI and reviews on a PR | `kit pr --open` then `watch_pull_request`; on the wake, `kit pr --merge` | `kit pr` polls as today |
| Long shell job (test suites, specs) | `kit go` (ticket 84); T3 has no shell-job runner that wakes a thread | `kit go` |
| Briefs, rules, skills map, talk style | `kit brief` (84) for every stage, passed to `delegate_task` | the same text, given to the headless run |
| Gates (tests, review verdict, merge, guards, release-check, UX checks) | kit | kit |
| Timed lead routines (talk-style verdict, Tuesday pack prep) | `schedule_task` | — (the kit's update timer stays systemd) |
| Board and status | T3 threads, pin and settle; tickets stay the record | tickets |
| Secrets, showing Lex results | `request_secret`, `html_render` | — |

## Decided behaviour

- **`kit slice` gains a T3 mode.** It's picked when the runner is a T3 thread (detect by T3's environment, or `--runner t3`), else headless as today. In T3 mode it doesn't start agents itself. It prints the next stage and that stage's brief: `NEXT: build|review|second-look|fix|pr`, with `kit brief --stage <stage>` output. It also records the state in `.scratch/kit-slice/<ticket>/state.json`.
  - **The runner** (the lead's delegated child, told so by its `kit brief`) passes the brief to `delegate_task` and ends its turn. When woken, it runs `kit slice --next`, which checks the stage's evidence (commit made, review verdict file, fix round count) and prints the next stage.
  - **Kit rules stay with the kit:** stage order, fix-round limits, "after three rounds only P0/P1 block", the waiver, and the 25-minute second-look limit (a child past it is cancelled with `task_cancel` and recorded as skipped).
- **Children can't start more children,** except the runner, whose brief says so. A stage child does its one stage and reports in its last line.
- **`kit pr --open` / `--merge`:** `--open` runs the checks and the review, opens the PR and prints `WATCH: <url>`. The runner calls `watch_pull_request` and ends its turn. On the wake, `kit pr --merge` checks readiness and merges. Without T3, `kit pr` keeps polling as one command.
- **Budget:** a slice's children count against the about-3-slices limit (one slice = its runner plus at most one stage child at a time). `kit next` counts T3 children from the state files.
- **Cost:** if T3 reports token use per thread, `kit slice` records it per stage for ticket 83's trial; if not, Done says so.
- **First run before switching the default:** one real small ticket runs in T3 mode end to end. Compare it with a headless slice of similar size (time, cost, how often the lead had to step in), and put both in Done. T3 mode becomes the default inside T3 only if it is at least as reliable.
- **Docs:** `docs/runner.md` and the kitchen's build station describe T3 mode first and the headless fallback second.

## Files

In the kit repo (`~/Projects/agent-kit`, through its own `kit pr`):
- `kit.d/slice` (T3 mode, `--next`), `kit.d/pr` (`--open` / `--merge`), `kit.d/next` (counting);
- `agent-run.mjs` (untouched as the fallback, except shared state);
- `kit.d/brief` (stage briefs, from 84);
- `docs/runner.md`, `docs/kitchen.md`, `tests/`.

## Done when

- Tests, failing first:
  - T3 mode prints the right next stage and brief for each state;
  - `--next` refuses a stage without its evidence;
  - the fix-round limit and the second-look time limit hold;
  - `kit pr --open` stops before merging and `--merge` refuses an unready PR;
  - headless mode is unchanged.
- One real ticket ran in T3 mode end to end. Its thread links and the comparison are in Done.
- agent-kit's `npm test`, `npm run lint` and `npm run test:kit-clean` pass.

## Kit commands and evidence

Agent Kit is required. In `~/Projects/agent-kit`: `kit doctor`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines, the PR URL and merge SHA.
