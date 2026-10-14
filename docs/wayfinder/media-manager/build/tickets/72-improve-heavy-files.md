---
title: Heavy pictures get lighter files
type: task (AFK)
status: open
assignee:
blocked_by: [70-improve-images-scan]
builder: sol
phase: 6
---

## What

Ticket [11](../../tickets/11-fix-all-existing-images.md#resolution-2026-10-13) "Heavy pictures already in the site".

- A new, lighter file with responsive copies, using the site's remembered image setting (AVIF too if chosen: see the spec's AVIF build check); every mention points at it (pages, components, sharing pictures, sitemap and others).
- The old file becomes unused and is offered by Clean up; Always keep protects one linked from outside.
- Every improved picture gets `width`/`height`, measured `sizes` and the loading order (slice 33).
- Per-page batches, so each page has its own Undo.

## Done when

- `tests/improve-images.test.ts`: new file and copies, every mention repointed, old file left for Clean up, width/height/sizes/loading.
