---
title: Image families, for both copy names
type: task (AFK)
status: closed
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

## Done (2026-10-14)

**Behaviour.** New pure module `src/page-builder/media-families.ts` groups an image with its responsive copies and any kept original as one Image family. Copies sit beside their main with the same base: `-<N>w` at any width (today's name), or a bare `-<N>` only at the copy widths 480, 960 and 1600 (ticket 07's name; the list is shared with `mediaResponsiveWidths`), so conflict numbers and dated names (`photo-2`, `photo-100`, `report-2024`) stay their own files. A copy prefers a main with its own extension, else one unique main. A copy without a main, and trimmed `-crop` files, are their own files. Originals are files in `media/originals/` (any extension, HEIC/HEIF included) whose base matches exactly one main; otherwise they stay apart. Phase 5 adds stills and subtitles to `MediaFamily`. `mediaVariants` (srcset) now finds both copy names. Images-tab rename and delete, and Files-tab and agent rename, move and delete (`moveFileTarget`/`deleteFileTarget`) take the whole family in one Undo step: copies follow the main, originals are renamed in `media/originals/`, every reference including `srcset` is rewritten, any taken destination refuses the whole rename, and every member's `.editor/media.json` record follows it. Files-tab Restore on a deleted main brings back the family. `isImagePath` is unchanged.

**Commits.** 7da1b6d7 claim; 93079aa0 build (Sol); a7467918 review fixes (Claude).

**Tests.** New `tests/media-families.test.ts` (both copy names, both at once, originals, copy without main, `-crop`, numbered names, folders, rename). Extended `media-workspace.test.ts` (family rename and delete in one Undo, hidden HEIC original guarded, records follow, used copy blocks Delete unused, taken destination), `file-operations-controller.test.ts` (Files family rename, delete and Restore, taken destination), and `native-media-library.spec.ts` (nightly: rename an image with copies, place it, `srcset` still written). `npm run check`, `unit.sh` (all pass), `npm run lint`, native-media-library + native-file-ops + native-images-tab specs (35/35).

**Review (GPT-6.1 Sol).** First review: 3 findings, all fixed: Restore took only the main; a bare `-N` of 100 or more grouped unrelated numbered names; only the main's record followed a rename. Second review: no defects. Rejected one validation gap (an agent `move_file`/`delete_file` integration test): those commands are thin wrappers (`src/main.ts:4663`) over the same `moveFileTarget`/`deleteFileTarget` that the new controller tests cover.

**Bytes.** Boot 341 KB gzip of 355 KB; entry about +0.8 KB.

**Follow-ups.** Slice 24 switches new uploads to `-480` (`mediaVariantName` still writes `-480w`). Slice 09 shows one tile per family; the Images tab still lists copies as their own cards.
