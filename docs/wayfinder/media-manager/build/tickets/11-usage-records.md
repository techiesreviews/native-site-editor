---
title: Usage records per media file
type: task (AFK)
status: open
assignee: claude (mm-11 runner)
blocked_by: [05-media-records, 06-image-families]
builder: sol
phase: 1
---

## What

The data behind the usage badge ([06](../../tickets/06-prototype-media-manager-look.md#resolution-2026-10-12), [10](../../tickets/10-safe-clean-up.md#resolution-2026-10-13)), built on today's reference scanner (`src/page-builder/media-references.ts`).

- Per family: the **distinct pages** that use it, **other uses** (stylesheets, components, settings, sharing pictures), and whether it is **checked** at all.
- A file the scan has not reached is **Not checked yet**; if any site file cannot be read, nothing counts as checked (as the scanner refuses today).
- Zero page uses alone never means unused.
- Phase 4 (slice 46) widens what is read; this slice keeps today's `.html`/`.css` reach and says so in the record.

## Done when

- `tests/media-usage.test.ts`: pages counted once per page, copies counted for their family, other uses apart, unreadable file makes everything unchecked, a file outside `images/` counted.
- `tests/media-references.test.ts` still passes.
