---
title: "`kit bg` jobs outlive a turn end and a T3 restart (`systemd-run --user --scope`, with a time limit)"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [77-check-the-retro-tickets]
---

## Goal

Lex (2026-10-30), from the lexvd.nl thread: a T3 server restart (and the end of a T3 turn, which is its own systemd scope) stops every process started from the session, including detached `kit bg` jobs. lexvd's 19-minute `kit specs` died after about 4.5 minutes, three times; the builder only finished by running it as a `systemd-run --user` service. The editor's own slices hit the same thing all week (2026-10-26 to 30): every slice brief now tells builders to start `kit slice` under `systemd-run --user --unit=kit-slice-<owner> …` and wait with `kit wait pid`, and two app restarts still killed `kit bg` jobs. So the workaround is real and repeated, but lives in every brief instead of the kit.

## Check (ke-77, 2026-10-30): build smaller, with `--scope`

Verdict on the [retro check](../retro-check-2026-10-30.md): build, smaller than first written. The evidence is strong. Tried on Lex's machine 2026-10-30 from inside a T3 turn (`t3code-claude-*.scope` under `app-t3code.slice`): `systemd-run --user --scope --quiet --collect <command>` runs the command in its own `app.slice/run-*.scope`, outside both the turn's scope and T3's slice. It keeps open file handles (fd 3) and the environment, and `-p RuntimeMaxSec=60` is accepted; `Linger=yes` for the user.

So `kit bg` only has to start its existing launcher (`setsid nohup node bg --wrapper …`) inside a scope. The pid, process group, start handshake (fd 3), log and exit records stay exactly as now, so `kit bg --list`, `kit bg --stop`, `kit wait job` and `kit next`'s job count need no change. The first plan, a transient *service*, would break that handshake (a service inherits no file handles), need every setting passed by hand and a unit-state reader, and change `--stop` to `systemctl`.

Dropped: changes to `kit pr`'s and `kit slice`'s step runner. A slice already runs under `kit bg`, so its `kit pr` and checks are inside the scope. A lead's own long `kit pr` goes under `kit bg` too (one line in runner.md).

## Decided behaviour

- `kit bg <name> -- <command>` starts its launcher as `systemd-run --user --scope --quiet --collect --description "kit bg <name> (<worktree>)" -p RuntimeMaxSec=<limit> setsid nohup …`. No `--unit` name, so two worktrees with the same job name never clash; the job's record stays the way to find it.
- **Time limit:** `--max <duration>` (default `6h`; `0` for none) becomes `RuntimeMaxSec`, so a forgotten job (a dev server started for one check) no longer lives forever now that a turn end does not stop it. A job stopped by the limit shows `exit 143` in `kit bg --list` and `kit wait job`, and its log's last line says the limit ended it.
- **Fallback:** `kit bg` already needs Linux (`/proc`, `setsid`, `flock`). Where `systemd-run --user` cannot start a scope (GitHub CI, containers, root, no user bus; probed once per start with a short timeout), it starts as today and prints `note: no user systemd; this job ends with the session`.
- `docs/runner.md` and the kitchen's station 6 drop the hand-written `systemd-run` line from every brief: "run long jobs (a slice, a lead's `kit pr`, long specs) with `kit bg` and wait with `kit wait job`". `kit next`'s reading of `kit-slice-*` units (ticket 29) stays for units already running and can go once none are left.

## Files

- In the kit repo (`~/Projects/agent-kit`): `kit.d/bg`, `tests/kit-bg.test.ts` (with a fake `systemd-run` on `PATH` that records its options and runs the rest), `docs/runner.md`, `docs/kitchen.md` (station 6), the `kit bg --help` text.

## Done when

- Tests with the fake `systemd-run`: a job starts through it with the description and the time limit; `--max 0` passes no limit; list, wait and stop work as before; with `systemd-run` missing or failing, the job starts the old way and prints the note. They fail before the change.
- On Lex's machine: a `kit bg` job started in one T3 turn is still running in the next turn (shown with `kit bg --list` and `cat /proc/<pid>/cgroup`), and `kit wait job` reports its exit.
- agent-kit's `npm test`, `npm run lint` and `npm run test:kit-clean` pass.

## Kit commands and evidence

In `~/Projects/agent-kit`: `kit doctor`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines.
