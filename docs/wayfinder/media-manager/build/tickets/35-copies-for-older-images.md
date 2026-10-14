---
title: Copies for older images; adopt existing sizes
type: task (AFK)
status: open
assignee:
blocked_by: [33-placed-image-markup, 24-media-folders-and-names]
builder: sol
phase: 2
---

## What

Ticket [08](../../tickets/08-responsive-image-output.md#resolution-2026-10-13) "Older images without copies"; research [05](../../tickets/05-research-images-on-existing-sites.md#resolution-2026-10-11) §6.

- Placing or swapping in an existing raster image with no copies first makes the missing 480/960/1,600 copies beside it (only smaller widths, the site's recipe, the naming rules), then places it. The file itself is not changed.
- Copies that already exist, such as WordPress-made sizes (`photo-480x320.jpg`) or techies-reviews' hand-made sets, are adopted instead of new ones; the family recognises them.
- One Undo step with the placement.

## Done when

- `tests/media-families.test.ts`: WordPress size names and a hand-made set adopted; no duplicates made.
- Nightly in `native-image-markup.spec.ts`: place an old 2000 px JPEG; three copies appear beside it and srcset lists them.
