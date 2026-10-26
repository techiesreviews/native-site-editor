---
title: "Screen sizes follow the canvas bar, which stays as it is"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [30-style-panel-shell]
---

## Goal

The panel edits whatever size the canvas shows ([ticket 04](../../tickets/04-grill-panel-scope.md#resolution-2026-10-26); Lex: "screen sizes need to stay as is in the current editor, also on the canvas with dragging etc."). Size: S.

## Decided behaviour

- The canvas bar is **not changed**: Desktop (fills), Tablet 768 and Mobile 390, the typed width and the drag handles (`src/components/canvas-bar.ts`, `src/page-builder/canvas-model.ts`).
- The panel subscribes to `src/page-builder/breakpoints.ts`. A dragged or typed width maps to a size as today (`canvas-bar.ts:148`: ≤390 Mobile, ≤768 Tablet, else all).
- Fields show the value at that size, falling back to the larger size's value in a lighter tone.
- The device chip in the selector field (slice 32) shows the size; its × sets the canvas back to Desktop.

## Files

Expected: `src/style-panel/controller.ts`, the existing canvas bar spec (unchanged and green), a spec writing the hero heading's size at Mobile.

## Done when

- At Mobile, changing the hero heading's size writes inside `@media (max-width: 390px)`; the canvas bar specs pass untouched.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-st-34 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-st-34 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower (the 355 KB goal of [tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md)). The panel and everything it needs load lazily; the lazy chunk's size is quoted in Done.
- `kit shots` for anything visible, light and dark, 390 and 1280 wide.
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
