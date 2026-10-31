---
title: "A builder can't end its turn while its own kit job runs (a Stop hook, with a way out)"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [78-kit-bg-outlives-the-session, 81-existing-projects-get-new-setup]
---

## Goal

Prompter ↔ CamFrame retro (Lex, 2026-10-31, via the chat workspace), finding 1. Delegated builders end their turn while their own `kit slice`, `kit review` or checks still run in the background, so nothing wakes them and the work stalls until the lead notices. Seen twice in a CamFrame builder ("The review is running in the background; I'll pick it up when it finishes") and twice on this board on 2026-10-30/31: am-21 ended after one 29-minute wait while its slice ran for 3 more hours, and ke-72 ended with "Tests are running in the background", although its brief said "Never end your turn while a job of yours runs".

## Check (lead, 2026-10-31)

Real and repeated. The proposed fix (a brief line: "run checks and `kit review` in the foreground") is not enough on its own: ke-72 had the matching line and still stopped, and a slice (1–4 hours) can't run in the foreground because a single tool call is cut at 10 minutes. So the kit enforces it where it already has hooks (Claude and Codex, ticket 68's `hooks/`), and the line goes into the runner guide and `lex-coding` (ticket 50) as well.

## Decided behaviour

- A Stop hook (Claude `Stop`, Codex's matching hook) refuses the end of a turn while a kit job started from this worktree is still running (`kit bg` records after ticket 78, and `kit-slice-*` units whose working directory is this worktree). The message names the job and the command to wait with (`kit wait job <name>` or `kit wait pid <pid>`).
- **Way out:** the hook lets the turn end when the job is past its time limit (78's `--max`), when the session has been refused 6 times in a row for the same job, or when `KIT_ALLOW_STOP=1` is set (the lead's escape hatch). It never blocks a session with no kit job.
- `docs/runner.md`: "Finish the whole job in this turn: a short check runs in the foreground; a long one runs under `kit bg` and you wait for it with `kit wait`; end only after its RESULT line."

## Files

In the kit repo (`~/Projects/agent-kit`, a PR through its own `kit pr`): `hooks/stop-guard.sh` (or beside `hooks/bash-guard.sh`), the hook entries `kit init` writes (`.claude/settings.json`, `.codex/hooks.json`), `tests/`, `docs/runner.md`.

## Done when

- Tests: a session with a running job is refused with the job's name and wait command; a finished job, no job, the time limit, the sixth refusal and `KIT_ALLOW_STOP=1` each let it end. They fail before the change.
- One real delegated child on this board, given a slice, stays in its turn until the slice's RESULT line (noted in Done).
- agent-kit's `npm test`, `npm run lint` and `npm run test:kit-clean` pass.

## Kit commands and evidence

Agent Kit is required. In `~/Projects/agent-kit`: `kit doctor`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines, the PR URL and merge SHA.

## Comments

- Lead, 2026-10-31: the Stop hook's entry is a piece `kit init` writes into each project, so it reaches the projects already set up through ticket 81 (`kit doctor` names it missing; `kit init --all` adds it). Done includes `kit init --all` after this lands.
- Lead, 2026-10-31: more evidence. am-24 ended its turn twice in one hour, both times right after a background wait plus `t3_background_wait` returned ("I'm waiting on it"). So the background-wait pattern in every brief is itself the trigger. The working pattern: a foreground loop of `timeout 580 kit wait pid <pid>` calls (each under the 10-minute tool limit) until the unit is inactive. `docs/runner.md` should teach that loop, and the Stop hook backs it up.
