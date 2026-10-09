---
title: "Add card ▾: choose the card's look"
type: task (AFK)
status: open
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
