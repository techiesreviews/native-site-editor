---
title: "Page-builder wiring leaves main.ts"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [87-site-loading-out-of-main]
---

## Goal

`main.ts` towards about 500 lines ([ticket 05, item 1](../../tickets/05-grill-architecture-choices.md#resolution-2026-10-22); [TD 01](../../../../work/tech-debt/issues/01-main-ts-size.md)). Split out of [85](85-main-ts-wiring-only.md) on 2026-10-25: after slice 70 `src/main.ts` was 2,863 lines, not the planned about 1,350, so the lead split the last cut into 86–89 plus a short 85.

Lines at `8d85f59d`: the command palette, `componentPorts`, `insertNativeComponent`, the editor workspace, block moves and `dragPageBlock` (635–1022), preview selection, `nativeCssWorkspace`, Page Structure, instance content, page meta and the page-builder site controls (1023–1488), and the card grids (2529–2615) move into one or two page-builder host modules that own their state (from [85](85-main-ts-wiring-only.md)'s comment: `nativeAddPoints`, `nativeVariantFiles`, `nativeLinkParents`, `nativeStructurePaintedSources`, `nativeStructurePaints`, `nativeComponentFieldToken`, `nativeComponentFieldSnapshot`). About −950 lines; the builder may split it into palette and component tools, and selection and structure.

## Decided behaviour

No visible change. Click-to-type (ticket 28) and drag-moves-the-block behave as now.

## Files

- `src/main.ts` (those regions), new host module(s) (names are the builder's), their unit tests
- `src/controllers/command-palette-controller.ts`, `src/controllers/preview-selection-controller.ts`, `src/controllers/page-structure-controller.ts` (ports only)
- `tests/main-ts-ceiling.test.ts`, `tests/workspace-session-guard.test.ts`, `docs/agents/code-map.md`

## Done when

- A moved function keeps its body (CODING_STANDARDS "Controllers"); ports are live (getters for `let` state) and typed with `satisfies` in tests; "Module order holds".
- `tests/main-ts-ceiling.test.ts` set to the new count rounded up to 10; `docs/agents/code-map.md` names the new module and the moved functions.
- `kit size` at or under 355 KB (report the delta); `npm run check`, `npm test`, `kit specs --affected` green.
- The page-builder, click-to-type and Page Structure specs green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Starts after 87; may run beside 88.

- `kit doctor`; `kit bg slice-89 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/89-page-builder-wiring-out-of-main.md --builder claude-opus-5-5`; `kit wait job slice-89 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected`, `kit size`.
- Review: `ASE_REVIEW_MODEL=claude-opus-5-5 kit review --ticket <this ticket>` (read-only). Land: `kit pr --ticket <this ticket>`.
- Report: `main.ts` lines before and after and the new ceiling, the module created, unit and specs `RESULT:` lines, `kit size` delta, review folder and decisions, PR and merge SHA.
