---
title: Shared commands find their helpers through KIT_HOME
type: task (AFK)
status: closed
assignee: ke-13
builder: claude
blocked_by: [12-own-commands-folder]
---

## Goal

Shared commands stop finding their helpers as `scripts/agents/…` inside the project and find them in the kit's own folder, so the shared part can run from anywhere on the machine (research 04, "Work this needs": about a dozen lines in `kit.d/`).

## Decided behaviour

- **The front door sets `KIT_HOME`** to the folder that holds the shared kit (today `scripts/agents` of this checkout) and passes it to every command; an already set `KIT_HOME` wins, so a kit branch can be tried against this editor (`KIT_HOME=<kit checkout>`), the gate ticket 01 point 3 asks for.
- **Shared commands call shared helpers through `KIT_HOME`**: for example `kit.d/next` running `join(worktree, "scripts/agents/kit")`, `kit.d/pr` running `scripts/agents/unit.sh`, and every `import` or `source` of `kit-lib`, `agent-run.mjs`, `review-brief.mjs`, `pr-tier.mjs`, `tickets.mjs`, `score-page.mjs`, `context-card.mjs`.
- **Project helpers stay project paths** (`shots.sh`, `port.sh`, `specs-affected.mjs`, `deploy-preview.sh`), reached from the project's top folder.
- **`kit doctor` proves it:** a doctor step runs one shared command with `KIT_HOME` pointed at a copy of the kit outside the repo and expects it to work.

## Files

- `scripts/agents/kit`, `scripts/agents/kit-lib.sh`, `scripts/agents/kit-lib.mjs`
- the shared `scripts/agents/kit.d/` commands that reach a helper by a project-relative path
- `scripts/agents/kit.d/doctor`
- `tests/kit.test.ts`, `tests/kit-doctor.test.ts`, `tests/kit-tests-clean.test.ts` if its paths move

## Done when

- A test copies `scripts/agents/` (without `project.d/`) to a temp folder, sets `KIT_HOME` to it, and runs `kit version`, `kit status`, `kit unit --help`, `kit review --help` and `kit next --help` from a temp project that has only a `kit.json`, the launcher-free front door and its own `project.d/`.
- `grep -rn "scripts/agents/" scripts/agents/kit.d` finds only project helpers and help text; the Done lists them.
- `scripts/agents/kit unit --affected` green; real `kit doctor` passes.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit only.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke13 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/13-helpers-through-kit-home.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke13 --timeout 2h`. While building: `scripts/agents/kit unit --affected`.
- Second look: as the README says.
- Report: unit and doctor `RESULT:` lines, the `grep` output, review decisions, PR and merge SHA.

## Done (2026-10-27)

- The front door sets and exports `KIT_HOME`: a value a person set wins (made absolute), else the folder holding the front door. A value it fills in itself it also exports as `KIT_HOME_DEFAULT`; a nested front door treats an inherited `KIT_HOME` equal to `KIT_HOME_DEFAULT` as unset, so a kit in another worktree (a `kit next --start` job, its slice and builder) runs its own `kit.d/` and library, while a person's `KIT_HOME` reaches every nested kit. It reads `kit-lib.sh` and the shared `kit.d/` from there and points `KIT_LIB`/`KIT_LIB_MJS` at it; a `KIT_HOME` without `kit-lib.sh` fails `RESULT: fail no kit at KIT_HOME <path>` (exit 2; stderr `… is not a kit folder (no kit-lib.sh)`). Outside git, the project is the folder around the front door, not around `KIT_HOME`.
- `kit-lib.sh` has `kit_home`, `kit-lib.mjs` has `kitHome()`: `KIT_HOME` unless it equals `KIT_HOME_DEFAULT`, else the library's own folder.
- Shared helpers come from `KIT_HOME`: `kit card` runs `$KIT_HOME/context-card.mjs`; `kit pr` runs `tickets.mjs check` and the focused `unit.sh` from it (a home inside the project keeps the short `scripts/agents/unit.sh` in the PR body, one outside it the absolute path); `kit next --start` starts the job through `$KIT_HOME/kit`; `kit version` shows the commit of `KIT_HOME` (`none` for a copy outside git). The other shared commands already reach their helpers beside themselves (`../kit-lib.mjs`, `../tickets.mjs`, `../unit.sh` …), which is the kit's own folder. `kit unit --affected` reads the import scan from the project's own `scripts/agents/specs-affected.mjs` (a project helper: it loads the project's TypeScript parser), only when `--affected` is given, and fails `unit --affected needs the project's scripts/agents/specs-affected.mjs` without it; so `kit unit --help` runs from a kit copy without `node_modules`. `kit ux` likewise reads the colour check from the project's own `scripts/check-colours.mjs` (it was `../../check-colours.mjs`, beside the kit), only when changed CSS needs it; a project without one gets no colour findings, and `kit ux --help` (and `sweep` and `learn`, which import `ux`) load from a kit copy.
- `kit doctor` has an eleventh check, `kit home`: it copies `KIT_HOME` (without the project's own commands folder when that sits inside it) to a temporary folder and runs `kit version` from the copy with `KIT_HOME` pointing at it; `✓ kit home: a copy of <home> runs kit version`, else `✗ kit home: a copy of <home> fails kit version: <last line>; fix: reach shared helpers through KIT_HOME, not scripts/agents/`.
- `grep -rn "scripts/agents/" scripts/agents/kit.d` now finds only project paths and text: `next` (the bg job runs the worktree's own front door `scripts/agents/kit`; its `wait:` line), `unit` (the project's `scripts/agents/specs-affected.mjs`); `ux` reaches the project's `scripts/check-colours.mjs` (and already `scripts/check-colours.allow.json`) from the project's top folder, a path the grep does not show, `doctor` (the project's `hooks/run.sh` and `hooks/bash-guard.sh`; fix texts naming `kit.json`, `worktree.sh`, `kit.d`), `kit.json` in usage and messages (`next`, `heartbeat`, `sweep`, `status`, `pr`, `review`, `unit`, `ux`, `wait`), the `scripts/agents/kit preview` hint in `heartbeat`, the builder briefs in `slice` and `fix`, and the `# shellcheck source=` comments in `card`, `version`, `deps`, `doctor`.
- Tests: `tests/kit.test.ts` copies `scripts/agents/` without `project.d/` to a temp folder, sets `KIT_HOME` to it and runs `kit version`, `kit status`, every shared command's `--help` (including `unit`, `review` and `next`) and a project command (which sees the copy as `KIT_HOME` and `KIT_LIB`) from a temp git project holding only `kit.json`, the front door and `project.d/`; once the copy is its own git checkout, `kit version` shows its commit, not the project's; a missing `KIT_HOME` fails. A second test runs three checkouts outside git: a front door whose project command runs another checkout's front door without `KIT_ROOT` (as a `kit next --start` job does) sees each checkout's own `KIT_HOME` and `KIT_LIB`, a person's `KIT_HOME` reaches both, and each `KIT_ROOT` is the folder around its front door. `tests/kit-doctor.test.ts` expects 11 checks with `✓ kit home` and fails a copy whose `kit version` fails. `tests/kit-pr.test.ts` points `KIT_HOME` at the fixture's `scripts/agents` (its fake `unit.sh` and `tickets.mjs`, with the real `kit.d` and library linked beside them); a second case points `KIT_HOME` outside the project and expects that home's `unit.sh` to run and its absolute path in the PR body. `tests/kit-card.test.ts` breaks the card through a `KIT_HOME` without `context-card.mjs`, directly and through the front door. `tests/kit-next.test.ts` runs `--start` without a fake kit and expects `$KIT_HOME/kit bg slice-al01 -- scripts/agents/kit slice …` called in the new worktree. `tests/kit-ux.test.ts` gives its fixture project the colour check. `tests/kit-unit.test.ts` and `tests/kit-settings.test.ts` give their fixture projects the import scan; `kit-unit` also expects the message without it; `kit-settings` clears `KIT_HOME` and `KIT_HOME_DEFAULT` from its clean env.
- Feature list: no change (agent kit tooling only, nothing an editor user sees).
- Validation: `scripts/agents/kit unit --affected` `RESULT: ok unit 390/390 (17 files)` (the clean guard ran 1219 kit tests from 35 files); `kit doctor` `RESULT: ok doctor 11/11 checks passed`; `npm run check` and `npm run lint` pass.
