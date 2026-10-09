---
title: Slot changes reach every page in one undo step
type: task (AFK)
status: open
assignee:
blocked_by: [44-edit-mode-slot-chip-label]
builder: claude ★
phase: 5
---

## What

Ticket [14](../../tickets/14-prototype-edit-component-visually.md) §8–9 (the prototype changed only the template; the build must not).

- A pure plan over the template and every page using the component: fixed → slot gives each page its own copy of the part's text, so it stays visible and editable there; renaming rewrites every page's `slot="…"`; slot → fixed or removed as decided (open point 6 in the [spec](../spec.md), which also asks when the page rewrites happen).
- Applied with the template edit as one `applyNativeOperation` (one transaction per user action, `CODING_STANDARDS.md`), so it succeeds whole, fails whole and undoes as one step.

## Done when

- Unit tests for the plan: fixed → slot on two pages; rename on two pages; slot → fixed; a page that doesn't fill the slot.
- Nightly spec: rename a slot with two pages using it; both pages and the template change; one undo restores all three.
