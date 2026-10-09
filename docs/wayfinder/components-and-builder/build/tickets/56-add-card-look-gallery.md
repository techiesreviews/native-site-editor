---
title: "Add card ▾: choose the card's look"
type: task (AFK)
status: closed
assignee:
blocked_by: [50-add-card-adds-card-component, 12-variant-parser-site-css]
builder: claude ★
phase: 6
---

## What

Ticket [09](../../tickets/09-prototype-add-existing-page.md) §7 and §9.

- The ghost Add card button splits into "+ │ ▾". The plus adds the slot's card component (slice 50); ▾ opens a gallery, "Add card as…", of every card look rendered with the site's CSS, and places a blank card of the chosen look. The link combobox follows.
- The looks: every card component on the site (a tag starting `card-` whose template has a heading slot), then the current component's variants (slices 11–12). Mixed looks in one grid are fine.
- The list of looks is a pure function; thumbnails can reuse `src/page-builder/thumbnail.ts`.
- Prototype: `prototype/cb-09-add-existing-page`, `src/prototype/cb09-core.ts` (`cardComponents` `:158`, `componentVariants` `:148`, `allLooks` `:176`), `cb09-look.ts` (`lookGallery` `:144`, `thumb` `:64`).

## Done when

- Unit tests for the looks: card components only, heading slot required, variants after components.
- Nightly spec: ▾ lists the starter's card looks and places the chosen one.

## Done (2026-10-10)

- An instance's card slot shows Add card as a split "+ Add card │ ▾" (`card-grid-controls.ts`); ▾ opens "Add card as…" (`src/components/card-look-gallery.ts`, loaded then, 1.9 KB gzip): the looks from the pure `cardLooks` (`src/page-builder/card-looks.ts`: card components by name, then the slot's card's variants from its CSS and the site's, tone left out, yes/no bare or `="true"`, default value skipped), each a live thumbnail (`thumbnail.ts`) of a blank card with the site's CSS, the slot's own marked "usual". Picking places a blank card of that look (a variant as its `data-*` attribute) after the slot's last item, one undo step; Link to a page… follows. `nativeInstanceInsertEdit` now takes one `data-*` attribute on the instance.
- Commits "Add card ▾ on a card slot: a gallery of card looks…" and follow-ups on `dev`.
- Tests: `tests/card-looks.test.ts` (4), looks in `tests/card-slot.test.ts` (other component, variants, named slot, refusals, escaping, the insert seal); nightly case in `native-add-card.spec.ts` (tiles, arrows, rendered thumbnails with variant CSS, Esc, card-quote placed with the combobox, a variant placed and undone).
