---
title: Link to a page… on a new card
type: task (AFK)
status: closed
assignee:
blocked_by: [50-add-card-adds-card-component]
builder: claude ★
phase: 6
---

## What

Ticket [09](../../tickets/09-prototype-add-existing-page.md) §1–2.

- After Add card, the card shows a "Link to a page…" combobox at its foot. Esc leaves the card blank.
- The list is every page except the grid's own and 404. Pages under the folder the existing cards link to (inferred from their hrefs) come first, then an always-visible "Other pages" group. Search covers all pages. Pages already in the grid are greyed out with "In this grid" and can't be picked.
- The grouping is a pure function. Load the combobox lazily.
- Prototype: `prototype/cb-09-add-existing-page`, `src/prototype/cb09-core.ts` (`cardFolder` `:70`, `pageGroups` `:112`), `cb09-list.ts` (`pageList`).

## Done when

- Unit tests for the grouping: inferred folder first, own page and 404 left out, "In this grid", search.
- Nightly spec: the combobox opens on a new card, lists the groups and closes with Esc.

## Done (2026-10-09)

- After Add card places a fresh card in an instance's card slot (slice 50), a lazily loaded "Link to a page…" combobox (`src/components/card-link-picker.ts`) hangs from the card's foot; the page scrolls to make room below, else it sits over the card. Groups from the pure `pageChoiceGroups` (`src/page-builder/page-choices.ts`): pages under the folder the slot's other cards link into, then Other pages; not the grid's page or 404; search by title (card-fill's `pageTitle`) or address; "In this grid" from those cards' links (`slotCardLinks`), greyed and not pickable. Esc leaves the card blank; it closes when the selection leaves the card or Undo takes it. Picking only closes it until slice 53 fills the card. Plain and collection grids keep their Add card.
- Commits "Link to a page… on a card slot's fresh card" and a review-fix commit on `dev`.
- Tests: `tests/page-choices.test.ts` (folder, groups, own page and 404, In this grid, search), `slotCardLinks` in `tests/card-slot.test.ts`; nightly case in `native-add-card.spec.ts` (opens on a new card, groups, greyed page, arrows, search, Esc, Undo).
