---
title: Components open on their own shape
type: task (AFK)
status: open
assignee: claude (mm-43 runner)
blocked_by: [39-image-button-and-popup]
builder: sol
phase: 3
---

## What

Ticket [09](../../tickets/09-prototype-crop-and-focus.md#resolution-2026-10-13) "Components, sharing and backgrounds".

- When a component's CSS gives its picture a fixed shape (`aspect-ratio`, `object-fit` on the slot's image), the popup opens on that shape, labelled "Card's shape (4:3)".
- Other shapes stay available with a note that this item will look different from the others.
- A component template's own fallback picture has no image popup. CSS background images get no crop or focus point.

## Done when

- `tests/component-shapes.test.ts`: reading a fixed shape from component CSS (`:host` rules, nested rules), no shape when none is set.
- Nightly in `native-image-popup.spec.ts`: a starter card's image opens on "Card's shape".
