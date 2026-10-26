---
title: "Components: `var(--` suggests the project's values, with swatches"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [12-token-colours-from-preview, 13-rule-scope]
---

## Goal

Fix fault 2 and the suggestion half of fault 4 ([ticket 06](../../tickets/06-grill-components-fixes.md#resolution-2026-10-26), items 2 and 3; research 02, faults 2 and 4, and "Other faults" 7). Size: M.

**Waits for** [atomic-catalogue slice 64](../../../atomic-catalogue/build/tickets/64-organism-components.md), released.

## Decided behaviour

- Monaco's built-in CSS variable suggestions stop duplicating the editor's own (`src/components/monaco.ts:127`): the built-in results are filtered, since CSS defaults have no switch for variables alone.
- The list always holds the site's token files (slice 13), including ones the shown page doesn't load.
- Order: the open file's own properties first, then the component's, then the site's (`sortText`). Each row shows its value.
- Colour tokens (slice 12) are colour suggestions, so Monaco draws their swatch; dark values show beside light.
- The list is wide enough not to cover the code in the pane beside the template.

## Files

Expected: `src/components/code-editor.ts:349-364`, `src/page-builder/css-intelligence.ts`, `src/components/monaco.ts`, `src/page-builder-host.ts`, unit tests for order and dedupe, `kit shots` of the list.

## Done when

- Typing `var(--` in `section-hero.css` lists each token once, with its value, colours with swatches, this file's first.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-st-22 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-st-22 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower (the 355 KB goal of [tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md)). The panel and everything it needs load lazily; the lazy chunk's size is quoted in Done.
- `kit shots` for anything visible, light and dark, 390 and 1280 wide.
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
