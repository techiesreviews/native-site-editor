---
title: The sub-screens share one layout
type: task (AFK)
status: open
assignee: claude (mm-111 runner)
blocked_by: [104-media-panel-size, 105-editor-toast]
builder: claude
phase: 8
---

## What

From the [UX and UI audit](../ux-ui-audit.md#to-check-a-15-and-agent-facing-text): Clean up, Recently removed, To check, Improve images and Manage collections.

- One header: ← icon button and title (Manage collections loses "Back to grid"); at most one helper sentence under it.
- Rows run full width; row actions are right-aligned at the panel edge. Row actions are secondary or text buttons; the screen's one primary sits in the pinned bottom row (slice 104).
- To check: "Looks right" (secondary) and "Edit" (text); helper "An agent wrote these. Check they read right."
- Clean up: the review uses the media grid (3 columns on phone) with each file's size; a ticked tile keeps its full picture with an inset 3 px ring (no white or black band); the group page says "Files used only from outside the site? Mark them Always keep." and the title shows what all groups free ("Clean up · 271 KB"); the confirm's primary uses the standard primary colour.
- Recently removed: Restore is a secondary button; one sentence, "Removed files stay here for 30 days."
- Improve images: Fix is a 36 px secondary button; row text "4 pictures · lighter copies for phones"; 20 px checkboxes with the theme's `accent-color`.
- Manage collections: one ⋯ menu per row (Rename, Delete last in red); keyboard hints hidden on touch (`pointer: coarse`) here and in the Media footer.

## Done when

- Specs updated for the renamed buttons and the ⋯ menus; the Clean up review at 390 shows three tiles per row.
- Shots of every screen this slice touched at 390, 768 and 1280, light and dark, before and after, on the real starter (`scripts/agents/shots.sh`).
- `npm run check`, `npm run lint`, unit tests, the touched browser specs; new code stays in the lazy media chunk (boot budget unchanged).
- Review by GPT-6.1 Sol (read-only `codex exec`) recorded.
