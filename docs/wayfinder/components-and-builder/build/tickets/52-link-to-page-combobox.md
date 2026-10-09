---
title: Link to a page… on a new card
type: task (AFK)
status: open
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
