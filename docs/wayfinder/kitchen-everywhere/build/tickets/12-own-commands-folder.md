---
title: Own commands in the project's own folder
type: task (AFK)
status: open
assignee:
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
