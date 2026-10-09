---
title: Slot changes rewrite the template and every page at once
type: task (AFK)
status: open
assignee:
blocked_by: [44-edit-mode-slot-chip-label]
builder: claude ★
phase: 5
---

## What

Ticket [14](../../tickets/14-prototype-edit-component-visually.md) §8–9 and decided at handoff (6). The prototype changed only the template; the build must not.

- Each slot change rewrites the template and every page that uses the component at once, as one undo step; Done only leaves the mode.
- A pure plan over the template and the pages:
  - **made a slot:** each page gets its own copy of the part's text, so it stays visible and editable there;
  - **renamed:** every page's `slot="…"` follows;
  - **made fixed:** each page's element for that slot is removed (undo restores it), and the template's text shows on every page.
- Applied with the template edit as one `applyNativeOperation` (one transaction per user action, `CODING_STANDARDS.md`), so it succeeds whole, fails whole and undoes as one step. Pages that aren't open are rewritten as drafts too.

## Done when

- Unit tests for the plan: made a slot on two pages; renamed on two pages; made fixed on two pages (their elements removed); a page that doesn't fill the slot; an instance whose page also has other instances.
- Nightly spec: with two pages using the component, make a slot fixed: both pages lose their element and show the template's text; one undo restores the template and both pages. The same for a rename.
