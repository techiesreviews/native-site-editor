---
title: "Edit component mode: build with the rail"
type: task (AFK)
status: closed
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

## Done (2026-10-10)

- In Edit component mode the rail builds in the template: a click inserts by the selection there (`templateClickTarget` in `block-insert.ts`: block parts and the unnamed items slot take blocks, a part of a named slot gets the block after the slot, a nested component after itself, a Section is refused with its reason); a drag probes the template's parts in the frame by template paths (`templateDropContainers` in the runtime; named slots and nested components refuse, edges pass up) and the place is checked against the template (`templateDropRefusal`) before it is written. One undo step on the template each. A `<slot>` is transparent to the content rules. A new instance starts with the unnamed slot's placeholder elements (`itemsMarkup` in `instanceMarkup`), so blocks built there show on it. A named cards slot takes no rail blocks (one would make it an ordinary slot).
- Commits "Edit component mode: build with the rail in the template (slice 43)" and two review fixes (named slots, drop check, proofs hold the mode's opening).
- Tests: `tests/block-insert.test.ts` (template click rule, drop refusal, slot inserts), `tests/drop-target.test.ts`, `tests/drop-report.test.ts`, `tests/native-insert.test.ts` (`itemsMarkup`); `native-edit-component-blocks-actual.spec.ts` (@actual: Paragraph clicked into the items slot, Heading dragged in with its line and label, Image dropped into the items and undone, named slot and Section refused, undo/redo, Done without reload, a new instance shows the new placeholder).
