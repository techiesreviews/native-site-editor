---
title: The 15-minute update timer
type: task (HITL)
status: open
assignee:
builder: claude
blocked_by: [30-kit-repo-and-move]
---

## Goal

Kit fixes reach every project and worktree within about 15 minutes of landing, with nothing for Lex to do (research 04, "Updates"; [ticket 04 resolution](../../tickets/04-research-how-projects-pull-the-kit.md#resolution-2026-10-26)). **Waits for Lex's OK:** it adds a timer to his user settings on this computer.

## Decided behaviour

- **A `systemd --user` timer** (`agent-kit-update.timer` and its `.service` in `~/.config/systemd/user/`) runs `kit update` every 15 minutes, starting at login. Lex's machine already uses `systemd-run --user` for long jobs.
- **The kit repo holds the two unit files** and `kit update --install-timer` writes and enables them; `--remove-timer` takes them out. The lead runs the install after Lex's yes.
- **A stalled timer is seen:** `kit doctor` warns after a day without an update (ticket 21), and the Tuesday sweep's kit-problem line names it (ticket 24).

## Files

- In the kit repo: `kit.d/update` (`--install-timer`, `--remove-timer`), the two unit files, their test.
- On Lex's computer, after his yes: `~/.config/systemd/user/agent-kit-update.timer` and `.service`.

## Done when

- The kit repo's test proves the unit files' contents and that install and remove are safe to rerun (with a fake `systemctl`).
- After install: `systemctl --user list-timers agent-kit-update.timer` shows the next run, and a kit merge shows up in `scripts/agents/kit version` in this repo within 15 minutes.

## Kit commands and evidence

Agent Kit is required. Built in the kit repo (`~/Projects/agent-kit`) with its own `kit doctor`, `kit unit --affected`, `kit review` and `kit pr`; builder `claude-opus-5-5` in a T3 thread started by the lead.

- Report: Lex's OK (date), the kit repo PR and merge SHA, the `list-timers` line, and the `kit version` line showing a fresh kit commit.

## Comments

- Lex (2026-10-27): yes, Tuesday pack Q3. One OK for 30, 31, 40–46 and 50: go in order once 10–24 have landed, and stop at the first problem. Easy-to-undo questions inside a slice take their recommended answer and are listed in the next Tuesday pack. Closing GitHub Issues still waits for his own OK in that project's Tuesday pack.
