---
title: Copies for older images; adopt existing sizes
type: task (AFK)
status: closed
assignee: claude (mm-35 runner)
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

## Done (2026-10-14)

- **Behaviour.** Placing or swapping in an existing raster image (JPEG, PNG, WebP, AVIF, still GIF, BMP) whose family has no copies first makes the missing 480/960/1600 copies beside it, only widths smaller than the image, then places it with slice 33's markup (`srcset` lists them). It covers the picker's Use and agent `place_media` (`placeMediaImage`), held files added in the picker (`MediaPlacement.uploads`), and component slot fills on pages (`placeMediaPath`; component templates never get copies). Copies use the site's image recipe (`mediaAddingSettings(records.adding).image`, Balanced by default) in its format; transparent pictures choose WebP or lossless PNG at the largest copy for one copy format. A copy is kept only when smaller in bytes than the existing file (slice 25). The existing file is read, never changed, re-encoded or re-uploaded. Names keep the main's exact stem with slice 24's copy names (`Older Photo-480.webp`). Page edit, copies and any records change are one batch: one Undo step. Animated images, SVG, small images and `media/originals/` are placed as before. Cancel while copies are made places and saves nothing; a newer page, records or main refuses. When copies cannot be made (worker or decode error, a copy over the 20 MiB upload limit, or no names that join the family) the image is placed at full size and the announcement adds "Smaller copies could not be made, so the full-size picture is used."
- **Adopted sizes.** `media-families.ts` now also groups WordPress sizes (`photo-480x320.jpg`, width from W) and hand-made sets: bare numbered files (100–10,000) in another format than a unique main, when there are two or more such numbers (`panel.jpg` + `panel-400/-800/-1200.webp`). A family with any copy gets no new copies (no duplicates). Lone numbered files (`report-2024.webp`), same-format numbers (`maxresdefault-34.jpg`) and conflict numbers (`photo-2.webp`) stay their own files. Adopted copies follow rename, delete and restore with their suffixes. `isLeftoverCopy` is unchanged.
- **Assumptions (★).** The two-number set rule (research 05's sets all have two or three); "no copies" means none at all (an adopted 400/800 set gets no 480/960/1600); the full-size fallback with a note. A file whose copies all fail the byte gate is tried again on each placement.
- **Code.** New lazy `src/page-builder/media-older-copies.ts` (`olderCopyWidths`, `olderCopyPaths`, `olderCopyFormat`, `makeOlderCopies`, reusable by slice 70); a copies-only worker mode (`optimiseMedia(..., copies)`); `media-place.ts`, `media-page-markup.ts`, `media-workspace.ts` (placement uploads reserved and batched), `media-picker.ts`, `media-controller.ts`.
- **Commits.** 5a278481 claim; 20c7a1b3 build (Sol; runner made the set check one pass, kept the "Add images" label, and applied the extra stale guards only when copies are made); 79244077 review 1 fixes; 0d6121eb review 2 fix; then this close.
- **Tests.** `media-families` (WordPress and hand-made sets, lone/same-format numbers apart, renames, a 400+480 set, `olderCopyWidths` incl. BMP and every adopted family → none, `olderCopyPaths`/`olderCopyFormat`), `media-optimise` (copies-only worker: no main, byte gate, animated → none, wrong type, transparent WebP/PNG choice), `media-controller` (one batch with `srcset`, held uploads, worker failure, oversized copy and no-names notes, cancel, changed main, adopted family; slot fill batch, cancel, changed main, component untouched), `media-workspace` (held additions reserve and save copies in one Undo). Nightly `native-image-markup.spec.ts`: an existing 2000 px JPEG placed from the picker gets three copies, `srcset` lists them, its bytes are unchanged, one Undo removes copies and placement. Ran `npm run check`, `npm run lint`, unit 2,826/2,826; browser image-markup, media-picker, mcp-media, components, media-library, media-adding, structure-slots 90/90; after review fixes image-markup, media-picker, components, mcp-media 37/38 (the picker smoke failed while a source file was being edited mid-run; 17/17 on rerun with image-markup). Sol's build run: six specs 70/70 with each font.
- **Review (GPT-6.1 Sol), 2 rounds.** Logs (run.log: model gpt-6.1-sol, sandbox read-only; result.md): `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-35/round-1/` and `round-2/`. Round 1 fixed 4 (P2): BMP excluded; transparent copies skipped the WebP/PNG choice; no upload-limit check on copies; no note when no names could be found. Round 2 confirmed them and fixed 1 (P2): copy-width numbers did not count toward a hand-made set; its validation gap (slot cancel and drift) was added. Rejected 0. Not re-reviewed after round 2: a one-line counting fix with tests.
- **Bytes.** `test:budget` 345 KB gzip before first preview paint (budget 355 KB), the same as dev after slice 34. Boot grows only by the family rule (about +0.2 KB gzip); copy making is a lazy chunk (about 1 KB gzip).
- **Follow-ups.** Slice 70/72 (Improve images): reuse `makeOlderCopies` for pages in bulk; adopt or rename lone hand-made copies the set rule leaves apart. Social and Site settings images are out of scope (ticket 08: no responsive copies).
