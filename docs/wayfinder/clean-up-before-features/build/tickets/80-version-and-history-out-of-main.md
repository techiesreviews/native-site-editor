---
title: "Version view, restore and history wiring leave main.ts"
type: task (AFK)
status: open
assignee: lead-80 (this session)
builder: sol
blocked_by: [22-workspace-session-callers]
---

## Goal

`main.ts` towards about 500 lines ([ticket 05, item 1](../../tickets/05-grill-architecture-choices.md#resolution-2026-10-22); [TD 01](../../../../work/tech-debt/issues/01-main-ts-size.md)). The version view and restore (about lines 1044–1167 at `89ac5e0e`) and the history controller's wiring and ports (in 647–1043) move into a module that owns their state; `main.ts` keeps one construction call. About −250 lines.

## Decided behaviour

No visible change. The history panel stays lazily loaded.

## Files

- `src/main.ts` (the regions above), new `src/version-view.ts` (name is the builder's), `src/controllers/history-controller.ts`
- Tests: new unit tests for the moved module (ports typed with `satisfies`), `tests/history-controller*.test.ts` as affected
- `tests/main-ts-ceiling.test.ts`, `docs/agents/code-map.md`

## Done when

- A moved function keeps its body (CODING_STANDARDS "Controllers"); the module holds no copy of host state (live ports).
- Version view, restore and history specs green (`kit specs --affected`).
- `kit size` at or under 355 KB (report the delta); `npm run check`, `npm test` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Edits `main.ts`: at most one other `main.ts` slice at once.

- `kit doctor`; `kit bg slice-80 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/80-version-and-history-out-of-main.md --builder sol`; `kit wait job slice-80 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected`, `kit size`.
- Review: `kit review --ticket <this ticket>` (GPT-6.1 Sol, medium, read-only). Land: `kit pr --ticket <this ticket>`.
- Report: unit and specs `RESULT:` lines, `kit size` delta, review folder and decisions, PR and merge SHA, `main.ts` lines before and after and the new ceiling.
