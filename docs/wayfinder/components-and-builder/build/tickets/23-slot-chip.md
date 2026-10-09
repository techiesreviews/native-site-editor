---
title: "The slot chip: one control for the label and Structure"
type: task (AFK)
status: open
assignee:
blocked_by: [22-making-mode-shell]
builder: claude ★
phase: 3
---

## What

One way to mark slots everywhere (decided at handoff, 8): ticket [14](../../tickets/14-prototype-edit-component-visually.md) §4's chip, built once here and used by making mode now and Edit component mode later (slice 44), and as the Structure badge (slices 25, 46).

- A shared control (for example `src/components/slot-chip.ts`). In the edit bar's name label it comes **after the element name** ("Section › Heading [title]").
- A slot is a solid purple chip; an items slot pink ("items ×1"); a fixed part a muted grey chip with its name struck through (the name it had, or the role name it would get, e.g. "text").
- A single click toggles slot ↔ fixed, after a short wait so a double-click never flips it (slice 24 adds the rename).
- In making mode: selecting any part on the canvas shows its chip in the label, so a part that is not a slot by default becomes one by clicking its grey chip. The plan is recomputed and the canvas outlines follow. No chips on the canvas, no "+ slot" on hover, and no slot entries in the context menu ([04](../../tickets/04-prototype-making-components.md) §3's canvas chips and menu are replaced).
- Prototype: `prototype/cb-14-edit-component`, `src/prototype/cb14-label.ts` (`slotBadge` `:48`, `decorateLabel` `:105`).

## Done when

- Unit test for the click/double-click timing helper.
- Nightly spec: in making mode, select a default slot and click its chip: it turns grey and struck, its outline goes, and Create leaves it fixed in the template; select a fixed paragraph and click its chip: it becomes a slot.
