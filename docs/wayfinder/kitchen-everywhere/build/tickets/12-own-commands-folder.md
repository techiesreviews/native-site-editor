---
title: Own commands in the project's own folder
type: task (AFK)
status: closed
assignee: ke-12
builder: claude
blocked_by: [11-project-settings-file]
---

## Goal

Each project keeps only its own commands (here `specs`, `shots`, `size`, `preview`) beside the shared ones, so the shared part can later leave this repo whole ([ticket 01 resolution](../../tickets/01-grill-how-the-kitchen-is-copied.md#resolution-2026-10-26) point 1; research 04, "Own commands beside shared ones").

## Decided behaviour

- **Two folders:** the front door `scripts/agents/kit` reads the shared `kit.d/` and the project's folder named by `commands` in `kit.json`. This repo's own folder is `scripts/agents/project.d/` (README helper decision 2); `specs`, `shots`, `size` and `preview` move there unchanged, with their helpers (`shots.sh`, `shots/`, `port.sh`, `specs-affected.mjs`, `deploy-preview.sh`) staying where they are.
- **`kit ux` stays shared:** its frame (feature list from settings, scripted checks, one reviewer, small bundle) fits any project; it takes screenshots through the project's own `shots` and says "needs a project shots command" when there is none. The editor's tries and steps files stay in the editor.
- **No hiding a shared fix:** a project command may not reuse a shared name; `kit doctor` fails on a clash, naming both files. `kit --help` lists shared and own commands in two groups.
- **`KIT_COMMANDS_DIR` stays** as the test override that replaces both folders.

## Files

- `scripts/agents/kit`
- `scripts/agents/kit.d/` → `scripts/agents/project.d/` for `specs`, `shots`, `size`, `preview` (moves only)
- `scripts/agents/kit.d/doctor`, `scripts/agents/kit.d/ux`
- `scripts/agents/kit.json` (`commands`)
- `tests/kit.test.ts`, `tests/kit-doctor.test.ts`, `tests/kit-ux.test.ts`
- `docs/agents/agent-scripts.md`, `docs/agents/code-map.md` (where the commands now live)

## Done when

- Tests prove: a command in the project folder runs; a name in both folders fails `doctor` with both paths; `KIT_COMMANDS_DIR` still replaces both; `kit --help` shows two groups; `kit ux` without a project `shots` says so.
- `scripts/agents/kit specs --help`, `kit shots --help`, `kit size --help`, `kit preview --help` work from a worktree; `kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke12 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/12-own-commands-folder.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke12 --timeout 2h`. While building: `scripts/agents/kit unit --affected`.
- Second look: as the README says.
- Report: unit `RESULT:` lines, the four `--help` checks, review decisions, PR and merge SHA.

## Done (2026-10-27)

- `scripts/agents/kit` reads the shared `scripts/agents/kit.d/` and the folder `commands` names in `scripts/agents/kit.json` (relative to the project's top folder, or absolute); bare `kit` lists "Shared commands" and "Project commands" apart. On a shared name the shared command runs. `KIT_COMMANDS_DIR` replaces both folders and lists one plain "Commands" group.
- `specs`, `shots`, `size` and `preview` moved unchanged to `scripts/agents/project.d/`; their helpers stay in `scripts/agents/`. `kit.json` `commands` is now `scripts/agents/project.d`. `shots/compare.mjs` runs `project.d/shots`.
- `kit doctor` has a tenth check, `commands`: it fails when a project command takes a shared name (`ok in both <shared file> and <project file>; fix: rename the project command`) or the named folder is missing; the `--help` check covers both folders.
- `kit ux` takes screenshots through the project's own `shots` (`KIT_UX_SHOTS`, else `KIT_COMMANDS_DIR`, else the `commands` folder) and fails `ux needs a project shots command (…)` before trying anything when there is none.
- Tests: `tests/kit.test.ts` (project command runs, two groups, shared name wins, `KIT_COMMANDS_DIR` replaces both), `tests/kit-doctor.test.ts` (clash names both files, missing folder, real shared and project helps), `tests/kit-ux.test.ts` (no folder, no `shots`, project `shots.mjs` used). The fake-project fixtures in `kit-specs`, `kit-size` and `kit-preview` tests name `project.d` through `KIT_COMMANDS_DIR`; `kit-shots-compare` follows the move.
- Commit 498334975 on dev (ee98c8dc4 on the build branch; the change above). Fix round: bare `kit` marks a project command that takes a shared name `(hidden by the shared <name>; kit doctor names the clash)`; a `commands` naming the shared folder adds no project group and fails doctor with `"commands" names the shared folder …`; `kit ux` only takes an executable `shots` file, as the front door does. New tests: absolute `commands` folder lists and runs; no `commands` key lists only "Shared commands:" and an unknown name exits 2; a non-executable `own/shots` gives "needs a project shots command"; the shared-folder doctor message.
- Second fix round: `kit ux` reads `commands` alone from the settings file, as the front door does, so a file without `project` still finds the project's `shots`; a broken file fails `ux scripts/agents/kit.json is unreadable: …`. Doctor's empty-folders fix reads `restore scripts/agents/kit.d or the "commands" folder`. New tests: ux with an incomplete and a broken settings file; the front door with a `commands` folder that does not exist (only "Shared commands:", `kit doctor --help` still runs).
- Third fix round: `kit ux` looks up the project's `shots` only when a try needs it, so touched features with no Steps file and no named screen still get the scripted checks and the review without one. New tests: `KIT_COMMANDS_DIR` shots win over the settings folder; an absolute `commands` folder; no screenshot needed and no project `shots`.
- Fourth review (the PR's, after three rounds; fixed by the runner): an unknown command with a broken settings file says `(scripts/agents/kit.json unreadable; run kit doctor)`; `kit ux` finds the project's `shots` before making any bundle or tries folder, and takes the first `shots` file in sorted order, as the front door does. New tests: a `commands` naming the shared folder adds no project group; a broken settings file still lists shared commands and names itself on an unknown command; no `shots` leaves no `.scratch/ux` folders. Rejected: the review's Standards line "No CODING_STANDARDS.md section applies" is a note, not a defect (the findings parser counts it as one without severity). Optional nits: the unused `env` parameter is gone; one shared folder helper in `kit-lib` is left for ticket 13, which moves these helpers.
- Docs: `docs/agents/agent-scripts.md` (two folders, `commands` key, doctor and ux lines), `docs/agents/code-map.md`.
- Feature list: no change (agent kit tooling only, nothing an editor user sees).
- Validation: `scripts/agents/kit unit --affected` `RESULT: ok unit 179/179 (7 files)`; all `tests/kit*.test.ts` plus docs guards `RESULT: ok unit 748/748 (32 files)`; `kit doctor` `RESULT: ok doctor 10/10 checks passed`; `kit specs|shots|size|preview --help` exit 0; `npm run check` and `npm run lint` pass.
- **Second look (Grok 4.7, 2026-10-27):** one P2, two P3s and two validation gaps, evidence `.scratch/reviews/review/ke12-second-look/20261027T091336Z` in the main checkout. With a broken `kit.json`, doctor's `commands` line still passes as "no \"commands\" in scripts/agents/kit.json", because `kit_setting` hides the jq failure (`kit.d/doctor:147`) (→ [ticket 27](27-doctor-commands-on-broken-settings.md), which also takes both validation gaps: the real `kit.json` through the front door and `kit --help` showing two groups). P3s fixed in the same docs PR: this Done cited the build-branch commit; tech-debt issue 12 named `kit.d/size`. Standards: none. Nits left: `kit ux`'s `projectShots` takes any execute bit and does not skip `_*` names (same file for a normal `0755` `shots`); the clipped Follow-ups below are [ticket 18](18-full-follow-ups.md).

### Follow-ups

- Spec (P3): ee98c8dc4:docs/work/tech-debt/issues/12-boot-back-under-355-kb.md:12 — P3 ticket: this open `ready-for-agent` issue still sends its builder to `scripts/agents/k
- Validation gaps (gap): No test runs the real `scripts/agents/kit.json` `commands` setting through the front door. `kit-specs`, `kit-size` and `kit-preview` tests all set `KIT_COMMANDS
- Validation gaps (gap): The Done-when says "`kit --help` shows two groups", but the new tests only run bare `kit` (`run([], env)`). Add one assertion in the two-groups test that `run([

