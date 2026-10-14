---
title: Image families, for both copy names
type: task (AFK)
status: open
assignee: claude (mm-06 runner)
blocked_by: [01-bring-dev-level]
builder: sol
phase: 0
---

## What

Group an image with its responsive copies and any retained original as one **Image family** ([07](../../tickets/07-one-upload-path.md#resolution-2026-10-13), [10](../../tickets/10-safe-clean-up.md#resolution-2026-10-13)). Today copies are found by name only (`mediaVariantName`/`mediaVariants`, `src/page-builder/media-markup.ts:61-74`) and listed as loose files.

- Recognise today's `name-480w.webp` and ticket 07's `name-480.webp` (build check from ticket 15), and originals in `media/originals/` with a matching base (any extension, HEIC included; `isImagePath` lacks HEIC today, `src/native-structure.ts:181`).
- A copy needs its main image beside it with the same base; a lone `name-480.webp` with no main is its own file (later offered by clean-up as a leftover copy).
- Trimmed copies (`-crop`) are separate media files, never family members.
- Video stills and subtitles join the family in phase 5 (leave a place for them).
- Today's rename and delete (Files tab, Images tab, agent `move_file`/`delete_file`) take the whole family ★, fixing research 04's finding that copies are left behind and `srcset` stops after a rename. Phase 4 widens rename to every mention.

## Done when

- `tests/media-families.test.ts`: `-480w` and `-480` copies, both at once, originals, a copy without its main, `-crop` kept apart, names with numbers (`photo-2-480.webp`), folders.
- `tests/media-workspace.test.ts`: rename and delete move or remove the copies with the main image, as one Undo step.
- `native-media-library.spec.ts` gains a nightly case: rename an image with copies and place it; `srcset` is still written.
