---
title: Clean-up suggestions and Always keep
type: task (AFK)
status: closed
assignee: claude (mm-47 runner)
blocked_by: [46-wide-use-scanner]
builder: sol
phase: 4
---

## What

Ticket [10](../../tickets/10-safe-clean-up.md#resolution-2026-10-13) "Always keep" and "What clean-up offers".

- Suggest files nothing uses, Trimmed copies no place uses, and leftover responsive copies whose main image is gone. Every kind can be suggested, downloads included.
- Never suggest **Always keep** files, Not checked yet files, or anything while a file cannot be read.
- Not part of clean-up: duplicates, large files, kept originals.
- Groups with count and size for the review (slice 50); the count for the badge (slice 49).

## Done when

- `tests/media-clean-up.test.ts`: each group, Always keep excluded, unchecked excluded, unreadable blocks all, leftover copies, kept originals excluded.

## Done (2026-10-14)

- **Behaviour.** New pure module `src/page-builder/media-clean-up.ts`: `mediaCleanUpSuggestions({ usage, records, sizes })` turns the wide use check (slice 46, `usageRecords()`) and `.editor/media.json` records into `{ state, blockedBy, groups, count, size }`. One item per Image family whose usage state is `no-uses-found`; the item's `members` are the whole family (main, copies, retained original) and its `size` their bytes (unknown sizes count 0). Groups in fixed order, empty ones omitted: `unused` (every kind, downloads included), `trimmed` (the main's record has `trimmedFrom`) and `leftover` (a responsive copy with no image of its base name: `isLeftoverCopy` in `media-families.ts`, sharing the copy-name rule with `mediaFamilies`; image-only, so `guide-480.pdf` is plain unused). Never suggested: a family with Always keep on any member, a family not checked, an orphan in `media/originals/` (kept originals). Nothing is suggested while `usage` is missing or files are pending (`not-checked`), or when a site file is unreadable or `.editor/media.json` cannot be read (`blocked`, listing the files; unreadable wins). `count` is the badge count (slice 49), `groups` with count and size feed the review (slice 50). Duplicates and large files are not considered. Not wired into the UI or controllers: slice 49 calls it with the media list sizes and parsed records (`null` when the records cannot be read).
- **Commits.** b2d88593 claim; 75384b55 build (Sol; runner change: the copy-name check is image-only); a5d63832 review fix; 079c308a close (landed on dev, CI green).
- **Tests.** New `tests/media-clean-up.test.ts` (each group with counts and sizes, family as one item, uses on pages/CSS/sitemap protect the family, Always keep on main/copy/original, no check and pending, individually unchecked, unreadable blocks all even while pending, unreadable records, leftover copies vs `-2`/`-2024`/PDF names, ambiguous two-main copy, orphan originals, trimmed family apart from its source); `tests/media-families.test.ts` gains the `isLeftoverCopy` case. `npm run check`, `npm run lint`, unit 2449/2449 (before the review fix; touched files 34/34 after). No browser spec touched (no UI or controller change).
- **Review (GPT-6.1 Sol).** 1 fixed: a copy left outside a family because two mains could own it was labelled a leftover whose main is gone. Both suggested validation cases added. 0 rejected.
- **Bytes.** First-paint budget 347 KB of 355 KB; the new module is not imported by any bundle yet, the families helper is a few bytes.
