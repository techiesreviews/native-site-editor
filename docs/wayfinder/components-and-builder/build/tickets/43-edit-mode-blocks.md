---
title: "Edit component mode: build with the rail"
type: task (AFK)
status: open
assignee:
blocked_by: [41-edit-mode-shell, 35-canvas-drag-new-blocks, 40-items-slot-drops]
builder: claude ★
phase: 5
---

## What

Ticket [14](../../tickets/14-prototype-edit-component-visually.md) §3 and the build notes.

- Blocks go into the template with the rail: click-insert by selection (slice 30) and drag with the line and label (slice 35), on the template's tree.
- Items slots take blocks into their placeholder content (it is the starting content of new instances); named slots refuse with the reason; Section is refused inside a template.
- Each insert or move is one undo step on the template.
- Prototype: `prototype/cb-14-edit-component`, `src/prototype/cb14-build.ts` (`mountRail` `:29`).

## Done when

- Nightly spec: insert a Paragraph into the template and drag a Heading inside it; a Section is refused with its reason; a new instance shows the items slot's new placeholder.
