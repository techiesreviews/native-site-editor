---
title: Doctor skips a failing kit home only when version caused it
type: task (AFK)
status: closed
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

## Done (2026-10-27)

- `kit doctor` skips a failing `kit home` under `KIT_DOCTOR_SKIP=help` only when the copy's `kit version` fails as `version --help` did: both time out, or both exit with the same status and print the same output, reading the copy's path as the kit's and leaving out the RESULT line the front door adds. A missing helper, another exit status, a `version (no usage)` help or a home that cannot be copied keeps `✗ kit home`, so `agent.sh build` is refused (exit 3). Each side keeps its own limit: the help `KIT_HELP_TIMEOUT`, the copy's `kit version` and the `kit` note's `version` `KIT_HOME_TIMEOUT` (default 10, as before); both timing out counts as alike.
- `docs/agents/agent-scripts.md`: the doctor gate wording says when `kit home` is skipped, and a resume gates as a build only when its `status.json` records `kind: build`.
- Tests (`tests/kit-doctor.test.ts`): a copy that fails through a missing helper, or with the same words but another exit, refuses `agent.sh build` with `✗ kit home`; a `version` whose help and copy both hang skips both (`skipped help, kit home`) while a copy that fails fast does not; `version (no usage)` with a copyable failing home still fails `kit home`; through the real front door, a version whose error names its own path, one that prints nothing (only the front door's RESULT line) and one that hangs (`RESULT: fail version interrupted`) are skipped and fail without the skip, while one naming the copy's project folder keeps `✗ kit home`; a run without `--quiet` puts the `problem: help` line between `✓ commands` and `✓ kit home` with no `✓ help` or `✗ help`; a resumed build with a full `status.json` starts its builder with `--resume <session>` and no `KIT_DOCTOR_SKIP`. The missing-helper and hang cases fail on the old doctor.
- Validation: `RESULT: ok unit 57/57 (1 files)` (`kit unit --affected`); `tests/kit-settings.test.ts`, `tests/kit-tests-clean.test.ts`, `tests/agent-scripts.test.ts` pass 60/60; `npm run lint` exit 0; `RESULT: ok doctor 11/11 checks passed`; `RESULT: ok status all 770 tickets, 592 closed, 2 open PRs`.
- Feature list: no change (kit-internal doctor gate, nothing a site editor user sees).
