---
title: "`kit bg` and `kit pr`'s long steps outlive a T3 restart"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [77-check-the-retro-tickets]
---

## Goal

Lex (2026-10-30), from the lexvd.nl thread: a T3 server restart (and the end of a T3 turn, which is its own systemd scope) stops every process started from the session, including detached `kit bg` jobs. lexvd's 19-minute `kit specs` died after about 4.5 minutes, three times; the builder only finished by running it as a `systemd-run --user` service. The editor's own slices hit the same thing all week (2026-10-26 to 30): every slice brief now tells builders to start `kit slice` under `systemd-run --user --unit=kit-slice-<owner> …` and wait with `kit wait pid`, and two app restarts still killed `kit bg` jobs. So the workaround is real and repeated, but lives in every brief instead of the kit.

## Decided behaviour (to confirm in ticket 77)

- `kit bg <name> -- <command>` starts the job as a transient user service (`systemd-run --user --unit=kit-<project>-<name> --collect`, with the working directory, PATH, HOME and the `ASE_*`/`KIT_*` settings passed on, output appended to the job's log), so it outlives the session, a turn end and a T3 restart. Where `systemd-run --user` is missing (another OS, no user bus), it falls back to today's detached process and says so once.
- `kit bg --list`, `kit bg --stop <name>`, `kit wait job <name>` and the job's log, status and exit code work exactly as now, reading the unit's state.
- `kit pr`'s and `kit slice`'s long steps (the full test set, specs, the build) run through the same path, so a restart mid-`kit pr` doesn't lose the run; a rerun resumes as today.
- runner.md and every brief drop the hand-written `systemd-run` line.

## Files

- In the kit repo (`~/Projects/agent-kit`): `kit.d/bg`, `kit.d/wait`, the step runner `kit pr`/`kit slice` use, their tests (with a fake `systemd-run`), `docs/runner.md`.

## Done when

- A test with a fake `systemd-run` starts, lists, waits on and stops a job through the unit; the fallback path is tested too.
- On Lex's machine: a `kit bg` job keeps running across a T3 turn end (shown), and `kit wait job` reports its exit.

## Kit commands and evidence

In `~/Projects/agent-kit`: `kit doctor`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines.
