---
title: The project settings file, this editor first
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [10-fixes-from-old-copies]
---

## Goal

Every value the kit takes from this editor today (folders, branches, checks, test runner, paths, preview) comes from one settings file instead, so the same kit can run another project. This editor is the first user and must work exactly the same ([ticket 01 resolution](../../tickets/01-grill-how-the-kitchen-is-copied.md#resolution-2026-10-26) points 1 and 2; [ticket 05 resolution](../../tickets/05-grill-rollout.md#resolution-2026-10-26) point 3).

## Decided behaviour

- **One file, `scripts/agents/kit.json`**, with the keys and this editor's values from research 04 ("The project settings file"): `project`, `mainRoot`, `devRoot`, `worktreePrefix`, `sharedNodeModules`, `branches` (`land`, `release`, `ci`), `commands`, `checks`, `unit`, `paths`, `featureList`, `techDebt`, `standards`, `maps`, `sharedFile`, `preview`, `rulebookExtras`. Research 04's table says which file reads each value today and where it is hard-coded.
- **One reader for both halves of the kit:** a small function in `scripts/agents/kit-lib.mjs` and one in `scripts/agents/kit-lib.sh` (through `jq`, which the hooks already need). The kit finds the file from the project's top folder (`git rev-parse --show-toplevel`), so worktrees read their own checkout's file.
- **Only `project` and `branches.land` are required.** A missing key turns its feature off with a plain line (no `preview`: `status` skips the preview row; no `devRoot`: `next` and `heartbeat` say they need one). A missing or broken file makes `kit doctor` fail with what to add.
- **Every hard-coded editor value goes**, including `origin/dev` and `dev` in `review`, `unit`, `pr`, `status`, `wait ci`, `doctor`; the main folder fallback `/home/ubulex/Projects/native-site-editor` in `kit-lib`; `native-site-editor-dev` in `next`, `heartbeat`, `deps`; `worktree.sh` lines 9–10; `CODING_STANDARDS.md` in the review brief; the three docs-guard tests and the visible paths in `pr-tier.mjs`. Environment overrides that exist today (`KIT_PREVIEW_URL`, `KIT_DEV_ROOT`, …) keep winning over the file.
- **The editor works the same:** same output, same evidence folders, same `kit next` choices.

## Files

- `scripts/agents/kit.json` (new)
- `scripts/agents/kit-lib.mjs`, `scripts/agents/kit-lib.sh`
- the `scripts/agents/kit.d/` commands and helpers that hold editor values (`review`, `unit`, `pr`, `status`, `wait`, `doctor`, `next`, `heartbeat`, `deps`, `sweep`, `score`, `feedback`), `scripts/agents/pr-tier.mjs`, `scripts/agents/review-brief.mjs`, `scripts/agents/unit.sh`, `scripts/agents/worktree.sh`, `scripts/agents/tickets.mjs`
- `tests/kit*.test.ts` that need a settings file in their temp repos; a new `tests/kit-settings.test.ts`
- `docs/agents/agent-scripts.md` (one paragraph on the settings file)

## Done when

- `tests/kit-settings.test.ts` proves: required keys checked, a missing optional key turns its feature off with its line, a broken file fails `doctor`, an environment override still wins.
- A temp repo whose `kit.json` says `land: main` gets `main` from `review`, `unit --affected`, `pr --dry-run`, `status` and `wait ci` (fake `gh`).
- `grep -rn "origin/dev\|native-site-editor" scripts/agents/kit.d scripts/agents/*.mjs scripts/agents/*.sh` finds nothing outside `kit.json`, the editor's own commands (`shots`, `specs`, `size`, `preview`) and comments; the slice's Done lists any it leaves and why.
- Every existing kit test passes; one real `kit doctor`, `kit status kitchen-everywhere` and `kit next --help` run on this editor print what they printed before.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only; touches shared plumbing, so `kit pr` runs the full kit test set.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke11 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/11-project-settings-file.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke11 --timeout 2h`. While building: `scripts/agents/kit unit --affected`, then `scripts/agents/kit unit tests/kit*.test.ts`.
- Second look: as the README says.
- Report: unit `RESULT:` lines, the `grep` output, before-and-after `doctor` and `status` lines, review decisions, PR and merge SHA.
