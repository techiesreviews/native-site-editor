---
title: Fill the card from a page, with the info strip
type: task (AFK)
status: open
assignee:
blocked_by: [51-card-fill-mapping, 52-link-to-page-combobox]
builder: claude ★
phase: 6
---

## What

Ticket [09](../../tickets/09-prototype-add-existing-page.md) §4–5.

- Picking a page fills the card through slice 51's mapping, one undo step.
- A strip on the card then lists each slot and its source, with Change page and close. It is information only.
- Prototype: `prototype/cb-09-add-existing-page`, `src/prototype/cb09-c.ts`, `cb09-core.ts` (`mappingList` `:455`).

## Done when

- `@smoke` spec (for example `tests/native-save/native-add-card.spec.ts`): Add card, pick an existing page: the card shows its title, description, image and link, the strip lists the sources; undo takes the fill back, then the card.
- Nightly: Change page refills; close hides the strip.
