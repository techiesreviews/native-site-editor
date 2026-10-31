---
title: "A builder can't end its turn while its own kit job runs (a Stop hook, with a way out)"
type: task (AFK)
status: closed
assignee: ke-84
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
- Lead, 2026-10-31: folded into [ticket 84](84-factory-brief-and-go.md) (the factory), which builds this Stop hook beside `kit brief` and `kit go`; closes as merged when 84 lands.

## Done (2026-10-31)

- Built and merged as part of [ticket 84](84-factory-brief-and-go.md): `hooks/stop-guard.sh` and `stop-guard.mjs` in the kit, in https://github.com/techiesreviews/agent-kit/pull/14 (`RESULT: ok merged #14 ed29ab6`). The Stop hook (Claude and Codex) refuses a turn end while a `kit go` job of the worktree, or a `kit-*` systemd unit working in it, still runs, naming the job and the command to wait with (`kit go <job>`, or `kit wait pid <pid> --timeout 9m` for a unit). It lets the turn end past the job's time limit, after six refusals in a row, or with `KIT_ALLOW_STOP=1`, and never blocks a session with no kit job. The kit's own headless agents set `KIT_ALLOW_STOP=1`, so a slice's builder is never held for the job that runs it.
- Tests (`tests/agent-hooks-factory.test.ts`): a running job is refused with its name and wait command; a finished job, no job, another worktree, the time limit, the sixth refusal, `KIT_ALLOW_STOP=1`, a unit in this worktree, a unit in a worktree nested inside it, and a Codex payload. They failed before the change.
- The runner line: this repo's `docs/agents/runner.md` teaches long jobs only through `kit go`, waited for in the foreground; the kit's rulebook station 6 says the same. The hook entries reach projects through `kit init --all` (see ticket 84's Done and ticket 92).
- One real delegated child staying in its turn until its slice's RESULT line: the lead's to record.
- **Closed with two items moved on** (the lead's call, 2026-10-31): the kit work is merged and rolled out to every other project; the Native Site Editor's hook entry and the lead's record of one real child staying in its turn are tracked in [ticket 92](92-factory-follow-ups.md).
