---
title: Make component from Structure and right-click
type: task (AFK)
status: open
assignee:
blocked_by: [22-make-component-creates-at-once]
builder: sol
phase: 3
---

## What

Ticket [04](../../tickets/04-prototype-making-components.md) §1: besides the edit bar, Make component is offered, on any element it is offered for (slice 02's rule), in the Structure row's ⋯ menu (`src/components/row-menu.ts`) and on right-click on an element in the preview or on a Structure row. Each entry does the same as the edit bar's (slice 22): it creates the component at once, with no dialog, and lands in Edit component mode on the new instance. The preview has no context menu yet; add a small one with the same entries as the row menu (slice 66 adds slot items to it in Edit component mode).

## Done when

- Nightly spec: the row menu and a right-click each make the component at once from the right element and open Edit component mode on it; neither offers it on `<main>` or inside an instance.
