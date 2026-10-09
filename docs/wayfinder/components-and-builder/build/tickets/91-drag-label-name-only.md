---
title: "The drag label shows only the block's icon and name, in Structure's colours"
type: task (AFK)
status: closed
assignee:
blocked_by: [35-canvas-drag-line-and-label]
builder: sol
phase: 4
---

## What

Lex (2026-10-09, screenshots of the drag label and of a Page Structure row): the floating label while dragging shows only the block's icon and name ("¶ Paragraph", "▭ Image", "Card project"), without the explanation line ("Into Div (stack) › after Image"). Style it like a Page Structure row (the same background, text colour, icon and radius as the Structure rows in light and dark, not purple). The insertion line stays as the position cue. A refusal still shows its reason (red, as now, slice 83's note by the pointer) because there the reason is the information. Same label for drags from the rail, moved blocks (slice 36), Structure drags (slice 37) and click-insert's flash (slice 30: show the name only, or drop the flash if it then adds nothing — keep whichever reads better in screenshots).

## Done when

- Unit/spec updates for the label text (name only, refusal keeps the reason); screenshots light and dark next to a Structure row for comparison.

## Done (2026-10-10)

- The floating drag label (`trackDrag` in `src/page-builder/insert-drag.ts`) shows only the block's icon and name for rail blocks, Add panel sections and moved blocks, styled as a Structure row's kind on the sidebar surface (`--surface-subtle`, `--radius`, `--size-control`; 12 px 600, muted, a component in `--component-text` with its mark), light and dark. Icons come from one helper shared with Structure (`blockIcon` in `element-icons.ts`, rule in `block-icon-kind.ts`). A refusal still shows its red reason and leaves it by the pointer; the insert/drop flash keeps its highlight without a label; `#status` still says where a block went. A Structure drag (slice 37) gets this label once it goes through `trackDrag` (`label` returns `{ name, tag, component }`).
- Commits `afd6b196` (Sol built, Claude reworked the flash's `where` chain and Structure's icon for non-component custom elements), `d23eb06e` (review: component colour, component identity from the site, not the tag).
- Tests: `tests/block-icon-kind.test.ts`; `tests/block-drag-session.test.ts` (where only on refusals); `native-block-drag.spec.ts` (label matches a Structure row's shape, kind type, colour, background and icon, light and dark), `native-block-move`, `native-blocks` (no success flash label), `native-section-drag`, `native-add-panel*`, `native-edit-bar-label` updated.
