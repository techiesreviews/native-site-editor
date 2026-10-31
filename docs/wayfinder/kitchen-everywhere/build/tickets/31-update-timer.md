---
title: The 15-minute update timer
type: task (HITL)
status: closed
assignee: ke-31
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
- Lead, 2026-10-29: after six review rounds of kit PR #3 only P0/P1 block; P2/P3 findings go to Follow-ups and the PR lands with the lead's waiver.

## Done (2026-10-30)

Lex's OK: 2026-10-27 (Tuesday pack Q3).

- **The kit PR:** https://github.com/techiesreviews/agent-kit/pull/3, landed through the kit's own `kit pr` as `02e4dcc` on the kit's `main` (2026-10-29 17:02 UTC), with the lead's waiver: "Merged with 4 waived findings" (all P2/P3; the last Claude review, of the final change, found no P0 or P1). CI run 40915240730: `kit` and `editor` jobs green. An earlier run failed one new test on the runner's bash 5.2 (a failed `$(< file)` leaves the script there; fixed in the last commit). Second look: skipped (Grok's weekly count used up, 8/8 in 2026-W44; the free OpenCode model opened no session within 300 s).
- **What it adds:** `kit update --install-timer` writes the kit's `systemd/agent-kit-update.timer` (every quarter hour, `Persistent=true`) and `.service` (runs the machine copy's `current/kit update`, retried after a minute when a run fails) into `~/.config/systemd/user/` and starts the timer; `--remove-timer` stops it and takes the files out. Both are safe to run again and fetch nothing. `tests/kit-update.test.ts` proves the unit files' contents (and, where installed, `systemd-analyze verify` accepts them), runs the installed service the way systemd does, and reruns install and remove with a fake `systemctl` and a temporary HOME.
- **Install (2026-10-29 23:41 UTC):** the timer was installed while the machine copy was still on `be756ab`, so its first run is the proof. `kit update --install-timer` → `RESULT: ok update timer installed: kit update runs every 15 minutes`; the only files written: `~/.config/systemd/user/agent-kit-update.timer`, `agent-kit-update.service` and the `timers.target.wants` link. Nothing else under `~/.config`, `~/.claude` or `~/.codex` changed.
- **`list-timers`** (right after the first run): `Fri 2026-10-30 01:00:00 CET 14min Fri 2026-10-30 00:45:29 CET 8s ago agent-kit-update.timer agent-kit-update.service`.
- **Within 15 minutes:** the timer's first run, at 2026-10-30 00:45:29 CET (3 min 49 s after the install, the machine copy behind `main` until then), logged `RESULT: ok update 02e4dcc (was be756ab)`; this repo's `scripts/agents/kit version` then printed `commit 02e4dcc` / `kit machine copy, updated 0 minutes ago` (`RESULT: ok version 02e4dcc node v24.21.0`). Before the install it printed `commit be756ab` / `kit machine copy, updated 8 hours ago`.

## Follow-ups

Left by the last two Claude reviews of kit PR #3 (P2/P3), for a kit PR:

- `--remove-timer` says "already removed" without asking systemd when both unit files and the wants link are gone; a timer deleted by hand without `daemon-reload` can still run. Ask for its `ActiveState` and stop it first (P2).
- The install reads an installed unit file with `$(< file)` after checking only `-f`; an unreadable one (root-owned after a `sudo` run) ends the run with no `RESULT` line on bash 5.2. Check `-r` too and treat it as changed (P2).
- `--remove-timer` does not stop a service waiting for its `Restart=on-failure` retry: also run `systemctl --user stop agent-kit-update.service` (P3).
- The service's comment says a failed run "tries again … up to three times in ten minutes"; `StartLimitBurst=3` counts the first run, so it is two retries. Reword or set 4 (P3).
- A failed `daemon-reload` on install says "systemctl --user status … says why", which cannot answer when the user manager is unreachable; say the files were written but the manager cannot be reached. After that, `--remove-timer` fails "nothing removed" without naming the files to delete (P3).
- A masked timer (its file a link to `/dev/null`) is written over by `--install-timer`, which unmasks it; leave a masked timer alone in install and remove (P3).
- Tests to add: the cases above, and a data folder with a quote in it refused like a bad `KIT_REPO`.
- Nits: write the temporary unit file under a hidden name (`.agent-kit-update.timer.$$`); say in the usage text to run `--install-timer` from the machine copy, since a branch checkout installs that branch's unit files.

