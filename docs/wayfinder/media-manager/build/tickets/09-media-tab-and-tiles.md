---
title: Media tab replaces Images, with the Tiles grid
type: task (AFK)
status: closed
assignee: claude (mm-09 runner)
blocked_by: [04-split-library-screens, 06-image-families]
builder: claude
phase: 1
---

## What

Ticket [06](../../tickets/06-prototype-media-manager-look.md#resolution-2026-10-12); design reference [tiles.html](../../prototype/tiles.html) and [tiles-validation.md](../../prototype/tiles-validation.md).

- The **Images** tab becomes **Media** (label, icon, keyboard shortcut if any). Files stays for pages, styles and scripts.
- Media opens on **All**: a dense square Tiles grid, 3 across on phones, 4 on tablets, 6 on wide screens; thumbnails crop to fit (the stored file is untouched).
- **One tile per Image family** (slice 06). Files with no picture preview get a clean surface with dark text.
- Filenames on hover, keyboard focus or selection with a mouse; always visible on touch; soft gradient blur behind names, sharp text.
- The Media screen's code loads on demand when the tab first opens ★.
- Until slices 14 and 17 land, a tile opens today's details sheet and More reaches today's Optimise sheet, so nothing is lost.
- Wording says Publish, not Save (research 04).

## Done when

- `native-images-tab.spec.ts` is ported to the Media tab (renamed `native-media-tab.spec.ts`) and passes ★.
- Screens checked at 390, 768 and 1280 px against the mockup (scratch screenshots for the lead; the stage set comes later).
- Byte-budget delta at boot is zero or negative.

## Done (2026-10-14)

- **Behaviour.** The explorer's Images tab is **Media**, placed Pages | Media | Files as in the Tiles mockup (Home selects Pages, End now Files; ids, type and ports renamed `media`; the tabs never had icons or a shortcut). Media opens on every file in a dense square grid: one cropped tile per Image family (`mediaLibraryTiles` in `media-library-filter.ts` hides responsive copies and kept originals; the stored file is untouched). Each tile shows its page count top left (today's "Used on N pages" control, opening details at the usage; the main counts its members' pages once, `mediaFamilyUsage`) and a round selection top right, both 44 px targets that never overlap, on a blurred top shade. The name shows on hover, keyboard focus or selection, always on touch, over a blurred gradient with sharp text. A file the browser cannot draw gets a clean surface with a file icon and its type. Columns follow the browse width: 3, 4 from 520 px, 6 from 800 px, 2 below 270 px (phones under about 360 px). The explorer widens to `min(1040px, 100vw - 32px)` while Media shows, so phones get 3, tablets 4 and wide screens 6 (a 480 px popover cannot fit 6 tiles with both targets). Arrow keys count the laid-out columns. All of this is in the lazy media chunk, loaded when Media first opens. A tile opens today's details sheet, which keeps **Optimise image…**; the selection bar keeps Optimise heavy, Tag and Delete unused. Wording says Publish, not Save. The bar (search, folder, sort, upload, tag chips) is unchanged for slice 10.
- **Commits.** 6547fc04 claim; 012347ba Media tab and Tiles; 29c97a31 review fixes; close.
- **Tests.** `tests/media-library-filter.test.ts` gains one tile per family (copies `-480w`/`-960`, originals, numbered and `-crop` names, non-images) and family usage (copy-only page, shared page once). `native-images-tab.spec.ts` is now `native-media-tab.spec.ts`: tab order and keys, 2/3/4/6 square tiles at 320/390/768/1280 px with both targets 44 px and apart, one tile per family with a copy's page counted, names hidden at rest and shown on hover, focus and selection, the no-preview surface, names always on touch; "compact details" now runs at 390 px (wide screens show details beside the grid). `native-manager-action-fades.spec.ts`: the two image cases test the tile's usage number and name reveal; the old name-line fade check for images is gone with the name line. Tab and region names updated in `native-media-library`, `native-media-pane`, `native-media-library-keys`, `native-media-transaction`, `native-palette`. `npm run check`, `npm run lint`, unit 2438/2438; media specs 63/63 after fixes; `native-upload`, `native-image-alt-refusal`, `native-asset-references`, `native-file-ops` 19/19; CI fonts: media tab, keys and fades 35/36, the failure being the Files "hidden Restore" test (see follow-ups). Scratch screenshots at 320, 390 (and touch), 768, 1280 (and dark) beside the mockup in the lead's `.scratch/shots/mm-09/`, on a scratch starter with the mockup's pictures, a `-480w` copy and an unreadable PNG.
- **Review (GPT-6.1 Sol).** First review: 2 fixed (a family tile counted only its main's pages; at 320 px the two 44 px targets overlapped). Re-review: no defects. Nothing rejected.
- **Bytes.** Boot 347 KB gzip of 355 KB, the same as untouched origin/dev measured in the same sitting; entry JS −8 B and CSS −1 B gzip. Lazy media chunk +731 B gzip (JS 10,001 → 10,001 B, CSS 2,243 → 2,974 B).
- **Follow-ups.** Slice 10: the toolbar shares one row from 560 px and the heading stays hidden; One bar replaces it. Slice 12: the top-left number is today's count; it still says 0 rather than Not checked yet. Slice 14: details of a file with no preview still shows a broken preview. `native-manager-action-fades.spec.ts` "a hidden Restore … restores" fails about 1 in 4 under CI fonts on untouched origin/dev too ("The repository or source changed meanwhile" on Delete); not caused by this slice, worth a `known-failures.json` entry or a fix by the Files owner.
