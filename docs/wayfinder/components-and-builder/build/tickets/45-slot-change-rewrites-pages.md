---
title: Slot changes rewrite the template and every page at once
type: task (AFK)
status: closed
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

## Done (2026-10-10)

- `slotChangePages` (`component-model.ts`, pure) plans the pages' side of a slot change; `applyChip` adds every changed page and template to the chip's one `applyNativeOperation` (every file read is in `expectedSources`; the status says how many pages follow). Made a slot: each instance that holds anything gets its own copy of the part, placed in slot order (an empty instance shows every fallback already and is left as it is); renamed: each `slot="…"` follows (to the unnamed slot the attribute goes; from it, its elements take the name and its text a `<span slot>`); made fixed: each page's element for the slot is removed with its line. Undo after Done: an operation's file mounted since (the page, opened at Done) is adopted at each step and moves through one kept source receipt (`native-operation-history.ts`), so page edits around it still undo. Edit bar: a focused slot chip hands the focus to the next chip after its toggle, not to the label's component link.
- Commits "Slot changes rewrite every page using the component in the same undo step (slice 45)", two review-fix commits and "Late-mounted files: only an adopted editable model moves through a kept receipt" (the full suite caught a read-only pane).
- Tests: `tests/slot-change-pages.test.ts` (13: made a slot on two pages, filled already, multi-line copy; renamed on two pages, unnamed both ways; made fixed on two pages, items, bare text; a page that doesn't fill it; several instances and other components; nested instances; another template's instance); `tests/native-operation-history.test.ts` (a late-mounted file moves through one kept receipt, rollback); nightly `native-slot-change-pages-actual.spec.ts` (@actual: Home and About, made fixed/renamed/made a slot each one undo, chip keeps focus, two changes then Done, a page edit, three Undos and Redos, About renders the template's heading).
