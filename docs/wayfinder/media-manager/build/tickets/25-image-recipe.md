---
title: The image recipe - presets, copies, never larger
type: task (AFK)
status: open
assignee:
blocked_by: [23-one-preparation-path]
builder: sol
phase: 2
---

## What

Ticket [07](../../tickets/07-one-upload-path.md#resolution-2026-10-13) "Images" and "Confirmed preset mappings"; today's worker `src/page-builder/media-optimise.ts` and `image-optimise.worker.ts`.

- Presets: Smaller files (WebP q70 ≤ 1,600), **Balanced** (WebP q80 ≤ 2,400, default), Higher quality (WebP q90, source size), Smallest files (slower) (AVIF q50 speed 8 ≤ 2,400, encoder in slice 28).
- Never enlarge. Transparent images compare WebP at the ordinary quality with lossless PNG and keep the smaller; under AVIF use the Balanced comparison.
- If preparing makes the main image larger, keep the smaller suitable version (JPEG/PNG where right), comparing only versions with the chosen size and personal details removed.
- Copies at 480, 960, 1,600, only below the main width, with the selected recipe, named `-480` (slice 24).
- Location and camera data dropped from every output.
- A non-animated GIF follows the still-image path; an animated GIF is kept as it is until phase 5 ★.

## Done when

- `tests/media-optimise.test.ts` extended: each preset's mapping, never larger, transparency, the smaller-eligible rule, copy widths, animated GIF untouched.
- `native-media-adding.spec.ts` nightly: a 3000 px JPEG becomes a 2400 px WebP with three copies.
