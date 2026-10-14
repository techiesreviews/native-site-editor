---
title: Adding settings in More, remembered per site
type: task (AFK)
status: open
assignee: claude (mm-26 runner)
blocked_by: [25-image-recipe]
builder: claude
phase: 2
---

## What

Ticket [07](../../tickets/07-one-upload-path.md#resolution-2026-10-13) "Adding and settings"; the Klaviyo-style before/after from research [01](../../tickets/01-research-mobbin-patterns.md#resolution-2026-10-11).

- More → **Adding settings** ★: quality for images (Smaller files, Balanced, Higher quality, Smallest files (slower)), video (Smaller, Balanced, Higher) and audio (Balanced, Higher quality, Speech), and **Keep original**. No Advanced section.
- Changed choices are remembered for this site in `.editor/media.json` (slice 05) and apply to future additions only; **Reset to defaults**.
- Video and audio choices are shown now and take effect in phase 5.
- Replaces the old Optimise sheet's `localStorage` defaults.

## Done when

- `tests/media-settings.test.ts`: defaults, remembered per site, reset, per-kind quality kept apart.
- Nightly in `native-media-adding.spec.ts`: choose Smaller files, add an image, it is at most 1,600 px; reload, the choice stays.
