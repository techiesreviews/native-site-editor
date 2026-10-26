---
title: "Components: Make component copies only what fits, without toasts"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: []
---

## Goal

Fix fault 1's third cause and the Make component toasts ([ticket 06](../../tickets/06-grill-components-fixes.md#resolution-2026-10-26), items 1 and 5; research 02, fault 1 cause 3 and "Other faults" 2). Size: M.

**Waits for** [atomic-catalogue slice 64](../../../atomic-catalogue/build/tickets/64-organism-components.md) and [catalogue slice 07](../../../atomic-catalogue/build/tickets/07-toasts-off.md) (no toasts, feedback in place), released.

## Decided behaviour

- Copied `:is()` and `:where()` lists are narrowed to the members the template has, using the matcher already there (`matches`, `compoundsOf` in `src/page-builder/component-css.ts`), and merged with another copied rule for the same element when the wrappers match: `:is(h1, …, address):where([slot])` becomes `h2:where([slot])`.
- No toast on Make component or its Undo (`src/page-builder/component-plans.ts:128,160,189`); the result shows on the new component itself (catalogue slice 07's in-place feedback).
- The canvas-bar note listing raw selectors (`component-css.ts:693-698`) goes. Rules that can't follow stay where they are.

## Files

Expected: `src/page-builder/component-css.ts`, `src/page-builder/component-plans.ts`, their unit tests, the Make component spec.

## Done when

- Make component on the starter's Recent work writes no selector naming an element the template lacks; no toast appears.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-st-21 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-st-21 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower (the 355 KB goal of [tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md)). The panel and everything it needs load lazily; the lazy chunk's size is quoted in Done.
- `kit shots` for anything visible, light and dark, 390 and 1280 wide.
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
