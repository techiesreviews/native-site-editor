---
title: The Clean up review
type: task (AFK)
status: open
assignee: claude (mm-50 runner)
blocked_by: [48-recently-removed, 49-media-tab-badge]
builder: claude
phase: 4
---

## What

Ticket [10](../../tickets/10-safe-clean-up.md#resolution-2026-10-13); the clean-up screens in [tiles.html](../../prototype/tiles.html); research [01](../../tickets/01-research-mobbin-patterns.md#resolution-2026-10-11) §7.

- Groups with preview collages, count and size; larger previews; file-level selection; confirmation; **Undo**.
- Checked, other-use and not-checked files stay clearly apart; scan limits are stated.
- Removed files go to Recently removed (slice 48).

## Done when

- `@smoke` `tests/native-save/native-media-cleanup.spec.ts`: an unused image appears in Clean up; remove it; it is in Recently removed; Undo brings it back.
- Screens checked at 390 and 1280 px.
