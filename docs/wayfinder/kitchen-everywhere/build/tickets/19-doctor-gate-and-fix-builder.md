---
title: A broken --help does not stop the fix builder
type: task (AFK)
status: open
assignee:
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
