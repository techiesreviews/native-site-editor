---
title: One shared rulebook plus per-project extras
type: task (AFK)
status: open
assignee: ke-20
builder: claude
blocked_by: [17-second-look-per-kind]
---

## Goal

One kitchen rulebook for every project, plus a short extras file per project, as `docs/agents/runner-extras-template.md` already does for build slices ([ticket 01 resolution](../../tickets/01-grill-how-the-kitchen-is-copied.md#resolution-2026-10-26) point 5). Today `docs/agents/kitchen.md` mixes the kitchen's stations with this editor's facts.

## Decided behaviour

- **The shared rulebook** holds the stations, house rules, pins, the UX ladder, weekly routines, "Tuesday review" (with its hard-to-undo list) and "Small chores on free models", worded for any project: it says "the project's landing branch" and "the project's checks" where it now says `dev`, `npm run check`, previews or the feature list. It lives with the shared kit, at `scripts/agents/docs/kitchen.md` until the move (ticket 30), and goes to the kit repo with it (README helper decision 3).
- **This editor's facts move to `docs/agents/kitchen-extras.md`** (named by `rulebookExtras` in `kit.json`): previews and `kit preview`, the feature list and `kit ux`, `src/main.ts` as the shared file, release to production, the starter worktrees. Short; it wins over the shared rulebook where they differ.
- **`kit rulebook`** prints the shared rulebook followed by the project's extras. `docs/agents/kitchen.md` becomes a short pointer ("run `scripts/agents/kit rulebook`", plus where both files are), and `AGENTS.md` keeps pointing at it, so nothing that links there breaks.
- **`kit next` reads the builder pins** from the shared rulebook (today from `docs/agents/kitchen.md`).
- **The shared command list** in `docs/agents/agent-scripts.md#kit` stays one line per command; shared commands are marked as such, own commands stay in this file.
- A template `scripts/agents/docs/kitchen-extras-template.md` for other projects (used by `kit init`, ticket 22).

## Files

- `scripts/agents/docs/kitchen.md`, `scripts/agents/docs/kitchen-extras-template.md` (new)
- `docs/agents/kitchen.md` (becomes the pointer), `docs/agents/kitchen-extras.md` (new)
- `scripts/agents/kit.d/rulebook` (new), `tests/kit-rulebook.test.ts` (new)
- `scripts/agents/kit.d/next`, `tests/kit-next.test.ts`
- `docs/agents/agent-scripts.md`, `docs/agents/runner.md` and `docs/agents/code-map.md` (links only)
- `tests/agent-scripts.test.ts`, `tests/code-map.test.ts` if their doc guards follow the moved text

## Done when

- Nothing the old `kitchen.md` said is lost: the Done maps each old section to its new place (shared or extras).
- `kit rulebook` prints both parts; `kit next` gives the same picks as before on this build's own map; the docs guard tests pass; `node scripts/agents/tickets.mjs check` passes.
- `scripts/agents/kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke20 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/20-shared-rulebook.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke20 --timeout 2h`. While building: `scripts/agents/kit unit --affected`.
- Second look: from ticket 17 on, `kit slice` runs it.
- Report: the section map, `kit next` before and after, unit `RESULT:` lines, review decisions, PR and merge SHA.
