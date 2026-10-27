---
title: A broken --help does not stop the fix builder
type: task (AFK)
status: closed
assignee: ke-19
builder: claude
blocked_by: []
---

## Goal

Slice 10 added a `help` check to `kit doctor` (every kit command must answer `--help`). `agent.sh` gates every `build` and `review` run on `kit doctor --quiet`, and `kit fix` starts its builder through `agent.sh` (`scripts/agents/kit.d/fix:14`). So when a slice's builder breaks one kit command's `--help` (a syntax error, a missing import), the fix-round builder that should repair it cannot start: `agent.sh` exits 3 with "kit doctor failed". This hits exactly the kit-editing slices of this build. Raised as a P2 by Claude's review of slice 10 (`.scratch/reviews/build/runner-ke10-fixes-from-old-copies/20261026T221751Z/findings.json`, `69ea19120:scripts/agents/kit.d/doctor:136`) but left only as a clipped follow-up; the Grok second look on slice 10 brought it back up. Still present on dev (`scripts/agents/agent.sh:21`).

## Decided behaviour

- **Builders still start:** a `build` run through `agent.sh` does not fail on the `help` check alone; doctor still runs every other check and prints the broken helps as a `problem:` line so the builder sees them.
- **Reviews and plain `kit doctor` unchanged:** `review` runs and a direct `kit doctor` still fail on a broken help.
- The slice picks the mechanism (for example `KIT_DOCTOR_SKIP=help` that doctor honours, set by `agent.sh` for `build`) and documents it in `docs/agents/agent-scripts.md`.

## Files

- `scripts/agents/agent.sh`, `scripts/agents/kit.d/doctor`
- `tests/kit-doctor.test.ts`, `tests/agent-scripts.test.ts`
- `docs/agents/agent-scripts.md`

## Done when

- A test in a fixture worktree with one command whose `--help` fails proves: `agent.sh build` gets past the gate and the broken help is named; `agent.sh review` still exits 3; `kit doctor` still fails `help`.
- A test runs `kit doctor` with `KIT_COMMANDS_DIR` unset and expects `✓ help:` with the real command count (the default path at `doctor:125` has no test today; Grok second-look gap).
- `scripts/agents/kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke19 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/19-doctor-gate-and-fix-builder.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke19 --timeout 2h`. While building: `scripts/agents/kit unit --affected`.
- Second look: as the README says.
- Report: unit `RESULT:` lines, review decisions, PR and merge SHA.

## Done (2026-10-27)

- `kit doctor` honours `KIT_DOCTOR_SKIP=help` (no other name): a broken `--help` prints `problem: help: <commands>; fix: …` (also under `--quiet`), is left out of the count, and the RESULT ends `; skipped help (KIT_DOCTOR_SKIP)`. When `version`'s help fails or hangs, a failing `kit home` check (it runs `kit version` from a copy of the kit) follows the skip too and prints `problem: kit home: …`; a `version` help without a `Usage:` line, a kit home that cannot be copied, or another command's broken help leaves a failing `kit home` failing. Every other check still runs and fails as before; a working help check is still counted.
- `agent.sh` sets `KIT_DOCTOR_SKIP=help` for `build` and for a `--resume` whose `status.json` records `kind: build`; it clears it for reviews, so a caller's value never loosens a review gate, and unsets it before starting the agent, so the builder's or reviewer's own `kit doctor` still fails on a broken help. When a build passes with a problem line, `agent.sh` repeats it on stderr with "building in <worktree> despite the problem above" and starts the builder. The builder itself sees the broken help through its own `kit doctor` run, as `✗ help`.
- Tests (`tests/kit-doctor.test.ts`): in a fixture worktree with one broken help, `agent.sh build` and a resumed build get past the gate and name it, `agent.sh review` (even with `KIT_DOCTOR_SKIP=help` set by the caller) and a resumed review exit 3, and `kit doctor` still fails `help`; a build with a broken help and a second failing check (missing hook config) is still refused with exit 3; an unreadable `status.json` stops a resume with node's exit 1 and one without a worktree gates nothing and is refused by the runner, neither starting a build; a resumed build reaches the runner (exit 1, no session) and a `status.json` without a kind gets the full gate (exit 3); a fake `claude` builder sees `KIT_DOCTOR_SKIP` unset although the caller set it; a broken `version` lets `agent.sh build` start with both problem lines, while a review fails `help,kit home` and another command's broken help leaves a failing `kit home` failing; a `version` without usage or a kit home that cannot be copied still fails `kit home` under the skip; doctor with the skip passes quietly with the problem line and still fails other checks; the real-commands test now runs `kit doctor` through the front door with `KIT_COMMANDS_DIR` unset and expects `✓ help:` with the real count.
- Docs: `docs/agents/agent-scripts.md` (doctor line and the `agent.sh` gate paragraph).
- Feature list: no change (kit plumbing, nothing a site editor user sees).
- Validation: `kit unit --affected` RESULT: ok unit 47/47 (1 files); `kit unit tests/agent-scripts.test.ts` RESULT: ok unit 32/32 (1 files); `npm run lint` passes.

### Follow-ups

- Validation gaps (gap): The `version (timed out)` branch at `scripts/agents/kit.d/doctor:256` is never tested. Only the `version (exit N)` case is. Add a test to `tests/kit-doctor.test.ts`: Give the fixture a `version` command whose help runs `sleep 5` with `KIT_HELP_TIMEOUT: "0.3"`, plus the failing `KIT_HOME` kit from the broken-version test. Run doctor with `KIT_DOCTOR_SKIP: "help"`. Assert exit 0, `problem: help: version (timed out)`, a `problem: kit home:` line, and a RESULT ending `skipped help, kit home (KIT_DOCTOR_SKIP)`.
- Validation gaps (gap): The skip is never tested without `--quiet`. Every test uses `--quiet`, so nobody checks that the `problem: help:` line appears beside the `✓` lines while the `✓ help` line is left out. Add a test: Run `f.run([], f.build, { KIT_HELP_TIMEOUT: "0.3", KIT_DOCTOR_SKIP: "help" })` with one broken command. Assert stdout has the problem line, has no line starting `✓ help:` or `✗ help:`, and still has `✓ commands:`.

