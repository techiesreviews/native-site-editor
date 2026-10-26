---
title: Shared commands find their helpers through KIT_HOME
type: task (AFK)
status: open
assignee:
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
