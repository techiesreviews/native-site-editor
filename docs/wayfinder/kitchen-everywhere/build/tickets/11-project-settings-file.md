---
title: The project settings file, this editor first
type: task (AFK)
status: closed
assignee: build/ke-11-project-settings-file
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

## Done (2026-10-27)

- **Settings file:** `scripts/agents/kit.json` holds this editor's values (the research 04 keys). Readers: `kitSettings()`, `kitBranch()`, `kitDevRoot()`, `kitMaps()` in `kit-lib.mjs`; `kit_setting <jq path>`, `kit_settings_problems`, `kit_dev_root` in `kit-lib.sh`. Both read the file from the project's top folder (`KIT_ROOT`, else `git rev-parse --show-toplevel`). Only `project` and `branches.land` are required.
- **Main root:** `KIT_MAIN_ROOT`, then `mainRoot`, then the main worktree (the git common folder's parent). The hard-coded `/home/ubulex/Projects/native-site-editor` fallback is gone.
- **Land branch:** `review`, `unit --affected`, `pr` (default `--base`, the refused branches, and the `--release` pairing with `branches.release`), `status`, `wait ci` (`branches.ci`, else `land`), `doctor`, `next` and `worktree.sh` read `origin/<land>`. `next --help` fills in the branch, so it prints what it printed before.
- **Other keys:** `devRoot` for `next`, `heartbeat`, `deps add` and doctor's dev-worktree check. `worktreePrefix` (else `<project>-`) and `sharedNodeModules` for `worktree.sh` and doctor. `checks` for `kit pr`'s check, unit, lint and extra steps. `unit.run`/`unit.files` for `unit.sh`. `paths`, `featureList` and `unit.docsGuards` for `pr-tier.mjs`. `standards` for the review brief. `maps` for `status`, `score`, `feedback`, `next`, `heartbeat`, `sweep`, `tickets.mjs` and the scoreboard map. `sharedFile` for `next` rule 3 and `sweep`. `techDebt` for `sweep`. `preview` for `status`.
- **Missing optional keys** switch their feature off with a plain line:
  - `status`: no preview row, and `tickets: none (no maps folder …)`.
  - `next` and `heartbeat`: `needs a dev worktree; add devRoot …`.
  - `kit pr`: `check: skipped (no checks.check …)`.
  - `unit.sh`: `needs unit.run …`.
  - `sweep`: drops the shared-file section.
  - `worktree.sh`: no `node_modules` link, with a line saying so.
  - With no `paths` or `featureList`, every change is code and the feature-list guard is off.
- **Doctor:** a missing, broken or incomplete file makes doctor fail with `✗ settings: <what to add>`. The first line is now `✓ settings: scripts/agents/kit.json (native-site-editor, lands on dev)` and the count is `9/9`. The other doctor lines on this editor are unchanged. `kit status kitchen-everywhere` and `kit next --help` print byte-for-byte what they printed before.
- **Environment overrides still win:** `KIT_MAIN_ROOT`, `KIT_DEV_ROOT`, `KIT_PREVIEW_URL`.
- **Tests:**
  - New `tests/kit-settings.test.ts` covers: required keys in both readers; missing, broken and incomplete files failing doctor; missing optional keys; environment overrides; and a `land: main` repo getting `main` from `review`, `unit --affected`, `pr --dry-run`, `status` and `wait ci` (fake `gh`).
  - The temp repos in `kit`, `kit-unit`, `kit-status`, `kit-sweep`, `kit-score`, `kit-feedback`, `kit-doctor`, `kit-next`, `kit-review`, `kit-fix` and `kit-pr` tests now carry a settings file. Doctor's tests expect the settings line.
  - `docs/agents/agent-scripts.md` gains the settings paragraph.
- **What the grep still finds,** and why:
  - The editor's own commands, as allowed: `kit.d/specs`, `kit.d/size`, `kit.d/preview` and `shots.sh`.
  - Comments only: `context-card.mjs` 68–69, `kit.d/learn` 90, and `deploy-preview.sh` 2 (its usage comment).
  - Files outside this ticket's list, left for a follow-up:
    - `kit.d/learn` 15: the `defaultSlug` should read `project`.
    - `kit.d/ux` 17 and 61: the default `--base origin/dev`. Research 04 counts `ux` among the editor's own commands.
    - `worktrees.mjs` 71, 121, 124 and 155: the protected dev worktree and the merged-branch hint. This is the helper behind `worktrees.sh`.
- **Values the grep does not catch, still in the code:**
  - `kit pr`'s `colours` step (`scripts/check-colours.mjs`).
  - The `slice` and `fix` brief text (`npm run check`, `npm run lint`, `docs/agents/features.md`), which is outside this ticket's files.
  - The front door still lists `kit.d/` itself, and nothing reads the `commands` and `rulebookExtras` keys yet (that is launcher work).
  - In `pr-tier.mjs`: `cleanGuard` (`^scripts/agents/`, `^tests/kit-`) and `unitTest` (`tests/*.test.ts`).
  - In `kit pr`: the `tests` folder it reads for focused unit files, and its "CI still runs … no Sol review" line.
  - In `sweep`: the "Hand-typed values in src/**/*.css" section.
- **Review round 1 fixes:**
  - `worktree.sh` makes the static-preview link again even before main builds the fixture.
  - `kitSettings()` strips trailing slashes from `maps` once, for every reader.
  - Bash `kit_main_root` takes `mainRoot` only from a valid file, as node does.
  - `deps add` lets `KIT_DEV_ROOT` win even without a usable file.
  - `unit.sh` prints the settings problem before asking for `unit.run`.
  - The review brief reads `standards` from the top folder of the worktree it was given. Because of that, the temp repo in `tests/agent-scripts.test.ts` now carries a settings file too (the only test outside `tests/kit*.test.ts` that needed one).
  - The layout paragraph in `agent-scripts.md` now points to the settings file.
  - New tests cover `worktree.sh`, sweep's missing-key lines, `kit pr`'s release pairing, the `deps add` prefix, a trailing-slash `maps` (heartbeat and `scoreMap`) and bash/node agreement on `mainRoot`.
- **Feature list:** no change (kit plumbing for agents; no editor UI).
