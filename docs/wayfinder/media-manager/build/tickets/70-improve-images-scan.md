---
title: Improve images - what would change, per page and component
type: task (AFK)
status: open
assignee: claude (mm-70 runner)
blocked_by: [46-wide-use-scanner, 35-copies-for-older-images]
builder: sol
phase: 6
---

## What

Ticket [11](../../tickets/11-fix-all-existing-images.md#resolution-2026-10-13) "Where and how" and "Left alone"; research [05](../../tickets/05-research-images-on-existing-sites.md#resolution-2026-10-11).

- A pure plan: rows for pages, and components as their own rows with their reach ("Site header, on 104 pages: 2 heavy pictures"), each listing what would change: outside pictures to bring in, heavy files to lighten, missing copies, `width`/`height`, `sizes`, loading order, GIFs to Looping video, YouTube/Vimeo players to "picture until tapped".
- **Left alone**: SVG logos and icons (they only get `width`/`height`), YouTube embeds' stills in structured data, pictures swapped in by scripts, sample code inside articles, component templates' own fallbacks. Descriptions are not part of it.
- Hand-made responsive sets are adopted, not duplicated (slice 35).
- Pictures Lex unticks are remembered as left as is ★ (in `.editor/media.json`).

## Done when

- `tests/improve-images.test.ts` on a techies-reviews-like fixture: rows and reach, every change kind, the left-alone list, adopted sets, unticked pictures skipped.
