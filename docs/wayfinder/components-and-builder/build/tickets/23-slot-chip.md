---
title: "The slot chip: one control for the label and Structure"
type: task (AFK)
status: open
assignee:
blocked_by: [41-edit-mode-shell]
builder: claude ★
phase: 3
---

## What

One way to mark slots everywhere (decided at handoff, 8, as changed by Lex on 2026-10-09: there is no making mode; Make component creates at once and lands in Edit component mode, slice 22): ticket [14](../../tickets/14-prototype-edit-component-visually.md) §4's chip, built once here and used in Edit component mode's edit bar label (slice 44) and as the Structure badge (slice 46).

- A shared control (for example `src/components/slot-chip.ts`). In the edit bar's name label it comes **after the element name** ("Section › Heading [title]").
- A slot is a solid purple chip; an items slot pink ("items ×1"); a fixed part a muted grey chip with its name struck through (the name it had, or the role name it would get, e.g. "text").
- A single click toggles slot ↔ fixed, after a short wait so a double-click never flips it (slice 24 adds the rename). The chip reports the click to its owner; slice 44 applies it to the template, slice 45 to every page.
- In Edit component mode (slice 41), selecting a part of the template shows its chip in the label, so a fixed part shows a grey chip that can be clicked to become a slot. No chips on the canvas, no "+ slot" on hover, and no slot entries in the context menu here (slice 66 adds them).
- Prototype: `prototype/cb-14-edit-component`, `src/prototype/cb14-label.ts` (`slotBadge` `:48`, `decorateLabel` `:105`).

## Done when

- Unit test for the click/double-click timing helper.
- Nightly spec: in Edit component mode on the starter's Recent work, selecting its title, its items and a fixed part shows a purple, a pink and a grey struck chip after the element name; a single click reports one toggle, a double-click none.
