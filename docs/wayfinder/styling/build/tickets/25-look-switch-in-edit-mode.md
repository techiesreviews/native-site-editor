---
title: "Components: see another look while editing a component"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: []
---

## Goal

In Edit component mode, show the component in any of its looks, so look rules can be seen while they are edited ([ticket 06](../../tickets/06-grill-components-fixes.md#resolution-2026-10-26), item 6; research 02, "Other faults" 4). Size: S–M.

**Waits for** [atomic-catalogue slice 64](../../../atomic-catalogue/build/tickets/64-organism-components.md), released.

## Decided behaviour

- The component bar in Edit component mode gets the component's look axes as segmented groups (catalogue Tabs part), read by `variant-intelligence.ts`. Choosing one changes the preview only; the page keeps its own `data-…` until the person changes it on the page.

## Files

Expected: the Edit component mode bar (as rebuilt by catalogue slice 64), `src/page-builder/variant-intelligence.ts`, its spec.

## Done when

- Editing Section hero, switching Layout to Centered shows the centred hero without touching the page's HTML.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-st-25 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-st-25 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower (the 355 KB goal of [tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md)). The panel and everything it needs load lazily; the lazy chunk's size is quoted in Done.
- `kit shots` for anything visible, light and dark, 390 and 1280 wide.
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
