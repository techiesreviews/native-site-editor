---
title: The block rail beside Structure
type: task (AFK)
status: closed
assignee: sol (runner: claude)
blocked_by: [04-six-block-catalogue]
builder: sol
phase: 4
---

## What

Ticket [12](../../tickets/12-prototype-drag-and-drop.md) §1.

- An icon rail at the far left, before Page Structure, always visible: the six blocks (slice 04) as plain icons (`src/components/element-icons.ts`). Hover or focus shows the name only ("Section", "Div", "Image"…), which is also the accessible label. Keyboard focusable.
- The Add panel keeps components and sections only.
- The rail is boot UI: report the byte-budget delta. Clicking and dragging come in slices 30 and 35.
- Touch drag is out of scope for this run (decided at handoff, 11); clicking a block works on touch.
- Prototype: `prototype/cb-12-drag-and-drop`, `src/prototype/cb12-rail.ts` (`mountRail`), `cb12.css`.

## Done when

- Nightly spec: the rail shows six blocks with their names as labels and tooltips, in light and dark.

## Done (2026-10-09)

- A "Blocks" rail (`src/components/block-rail.ts`) is the workspace's first column while a native page is in the visual preview: the six catalogue blocks as icons from `element-icons.ts`, the name as accessible label and as a tooltip on hover or keyboard focus, arrows among them, kept when Structure is collapsed, a row above the sidebar in the narrow layout. Click is an `onPick` seam for slice 30. Add already listed only components and sections. Boot assets +431 B gzip.
- Commits `9384033` (built by Sol), `13c14ab` (review: focused block keeps its tooltip; spec waits for the Add panel to settle).
- Nightly spec `tests/native-save/native-block-rail.spec.ts` (light and dark, collapsed, narrow, hidden without a native page and back); `native-resize-toggle.spec.ts` updated for the rail.
- Follow-up (2026-10-09): the rail narrowed the canvas 48px, so in `native-cards.spec.ts` "…popup tracks scroll…" the card popover no longer fit beside its Add button and opened above it, then flipped below after the 80px scroll (placement as designed); the spec now scrolls 40px and checks the popover moves with the button, then that further scrolling puts it below the button, not over it.
- Suite fix (2026-10-09): beside the rail the History diff is narrow enough that the changed line's end sits under its scrollbar; `native-monaco-features.spec.ts` "the version compare…" clicks the changed words instead of the line's last token.
