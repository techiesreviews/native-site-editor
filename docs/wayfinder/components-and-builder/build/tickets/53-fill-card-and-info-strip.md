---
title: Fill the card from a page, with the info strip
type: task (AFK)
status: closed
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

## Done (2026-10-10)

- Picking a page in "Link to a page…" fills the fresh card as one undo step (`fillCard` in `src/page-builder/cards.ts`, writing `cardFill`'s rows with the pure `cardFillMarkup` in `card-fill.ts`): text, image (srcset and picture sources dropped), link slot "Read about …"; a slot with no element gets its fallback's shape in template order; a card without a link slot gets its title wrapped in a plain link (decision 3). The combobox gives way to an information strip (`src/components/card-fill-strip.ts`, lazy): the page, each slot and its source, Change page (fills again from the card as added; Esc goes back) and close. Undoing the fill, or any change to the card, drops the strip.
- Commits "Picking a page fills the new card; a strip lists each slot's source" and a review-fix commit on `dev`. Byte budget: about +2.6 KB gzip before first paint.
- Tests: 8 `cardFillMarkup` cases in `tests/card-fill.test.ts`; `@smoke` fill/strip/undo-twice and nightly Change page / Esc / close cases in `native-add-card.spec.ts`.
