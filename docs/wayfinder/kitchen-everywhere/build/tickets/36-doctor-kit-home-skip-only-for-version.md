---
title: Doctor skips a failing kit home only when version caused it
type: task (AFK)
status: open
assignee: ke-36
builder: claude
blocked_by: [27-doctor-commands-on-broken-settings]
---

## Goal

The OpenCode second look on [ticket 19](19-doctor-gate-and-fix-builder.md#done-2026-10-27) (P2, evidence `.scratch/reviews/ke19-second-look/20261027T154049Z` in the main checkout) found the `kit home` exemption wider than ticket 19 decided: whenever `version --help` exits non-zero or times out, any failing `kit home` check is skipped under `KIT_DOCTOR_SKIP=help` (`scripts/agents/kit.d/doctor:288`), also when the copy's `kit version` failed for another reason (for example a missing helper). A build can then start on a broken kit home, though ticket 19 says every other check still runs.

## Decided behaviour

- The `kit home` failure is skipped only when the copy's `kit version` failed because of `version` itself: its exit status and output match the broken help seen by the `help` check (same command, same exit or timeout). Any other failure of the copy keeps `✗ kit home` and the gate.
- The five test gaps from ticket 19's second look and Follow-ups get cases (below).

## Files

- `scripts/agents/kit.d/doctor`
- `tests/kit-doctor.test.ts`
- `docs/agents/agent-scripts.md` (the doctor gate line, only if the wording changes; also "a build (or a resumed build)" at `:122` becomes "a build, or a resume whose `status.json` records `kind: build`")

## Done when

- A broken `version` help plus a copyable home whose copy fails through a missing helper: `agent.sh build` is refused (exit 3) and doctor prints `✗ kit home`.
- `version (timed out)`: `version` help sleeps past `KIT_HELP_TIMEOUT`, the failing home is skipped, and the RESULT ends `skipped help, kit home`.
- `version (no usage)` with a copyable home whose `kit version` fails: help is skipped, `kit home` still fails.
- A run without `--quiet` shows the `problem: help` line among the `✓` lines, no `✓ help` or `✗ help`, and `✓ commands`.
- A resumed build with a full `status.json` (`kind: build`, session, model, CLI, brief, worktree) and a fake builder really starts, and the builder sees no `KIT_DOCTOR_SKIP`.
- `scripts/agents/kit unit --affected` green; real `scripts/agents/kit doctor` and `scripts/agents/kit status` `RESULT:` lines in the Done.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke36 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/36-doctor-kit-home-skip-only-for-version.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke36 --timeout 2h`. While building: `scripts/agents/kit unit --affected`.
- Second look: as the README says.
- Report: unit, doctor and status `RESULT:` lines, review decisions, PR and merge SHA.
