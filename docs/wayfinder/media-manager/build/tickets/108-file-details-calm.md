---
title: File details: one fact line, a calm preview, actions in order
type: task (AFK)
status: open
assignee: claude (mm-108 runner)
blocked_by: [105-editor-toast]
builder: claude
phase: 8
---

## What

From the [UX and UI audit](../ux-ui-audit.md#file-details-picture-b-01-to-b-03-video-b-08-b-09-audio-b-10-pdf-b-11-vimeo-b-12), file details for every kind, the usage popup and Rename.

- Facts become one 13 px muted line, "WebP · 2000 × 1125 · 47 KB · media/images", plus "Added 14 Oct" when dated (Shopify, Squarespace), replacing the 2×2 card.
- The preview takes the file's own aspect ratio up to `max-block-size: 50dvh`; no empty bands.
- Actions: Replace everywhere… and Optimise… as secondary buttons; a ⋯ menu holds Copy path, then Remove… last in red text. Picture, video, audio, PDF and Online video all say "Remove…" (no "Remove from Media…").
- Usage: an empty "Other uses · 0" group is hidden; page names are links in both themes.
- Usage popup: no Close button (✕ and Escape close it); File details is its one secondary action.
- Copies and original: two-line rows (name, then "Smaller copy · 1600 px"), size aligned to the first line.
- Decorative and Always keep: 44 px rows with the helper as the row's second line.
- Rename's "is taken" message gets a ⚠ glyph, so it is not colour only.

## Done when

- Also shot (not in the audit's sets): details of a generic download (ZIP or DOCX).
- Specs updated for the moved actions (Copy path and Remove in the ⋯ menu) and the one-line facts.
- Shots of every screen this slice touched at 390, 768 and 1280, light and dark, before and after, on the real starter (`scripts/agents/shots.sh`).
- `npm run check`, `npm run lint`, unit tests, the touched browser specs; new code stays in the lazy media chunk (boot budget unchanged).
- Review by GPT-6.1 Sol (read-only `codex exec`) recorded.
