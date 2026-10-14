---
title: Placed-image markup - srcset, sizes, loading order
type: task (AFK)
status: open
assignee:
blocked_by: [32-measured-sizes, 25-image-recipe]
builder: sol
phase: 2
---

## What

Ticket [08](../../tickets/08-responsive-image-output.md#resolution-2026-10-13) "Everyday page markup", "Size hint", "Loading order"; `src/page-builder/media-markup.ts`.

- Plain `<img>` with `srcset` (copies smaller than the main image plus the main at its real width; never the original) and measured `sizes`; `width`/`height` from the file used. Replaces the `960px` default.
- Lazy images get `loading="lazy"` and `auto, ` before the measured list. Images whose top is on the first screen at phone or desktop width load straight away, without `auto`; the first large one gets `fetchpriority="high"`.
- Re-checked when an image is placed, replaced or moved. No switch in the edit bar.
- Images in component slots get the same markup; a component template's own fallback is left alone.
- The preview's asset scanner (`referencedAssets`, `src/main.ts:2319`) uses the shared scanner, so `srcset` copies load in the canvas.

## Done when

- `tests/media-markup.test.ts`: srcset order, sizes with and without `auto`, eager first-screen image, `fetchpriority` on the first large one only, width/height, slot images, template fallback untouched.
- `@smoke` `tests/native-save/native-image-markup.spec.ts`: place an image on the starter's home page; it has srcset, measured sizes, width/height; a lower image is lazy with `auto`.
- Full suite green.
