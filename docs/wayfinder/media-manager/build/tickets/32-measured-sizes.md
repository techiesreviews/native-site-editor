---
title: Measure how wide an image shows
type: task (AFK)
status: open
assignee: claude (mm-32 runner)
blocked_by: [01-bring-dev-level]
builder: sol
phase: 2
---

## What

Ticket [08](../../tickets/08-responsive-image-output.md#resolution-2026-10-13) "Size hint"; research 03 §3.

- The preview measures an image's rendered width at phone, tablet and desktop widths and either side of the site's own breakpoints (read from its stylesheets), using the cover-adjusted width when it is shaped by `object-fit: cover`.
- A pure function turns the measurements into a `sizes` list, rounded up.
- Also reports whether the image's top is on the first screen at phone or desktop width (for slice 33's loading order).
- No markup change yet.

## Done when

- `tests/image-sizes.test.ts`: measurements to `sizes`, breakpoints, cover-adjusted widths, rounding, a full-width image.
- A nightly spec measures a starter image at three widths through the preview.
