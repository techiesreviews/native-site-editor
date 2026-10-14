---
title: One bar - search, Collections dropdown, More
type: task (AFK)
status: closed
assignee: claude (mm-10 runner)
blocked_by: [09-media-tab-and-tiles]
builder: claude
phase: 1
---

## What

Ticket [06](../../tickets/06-prototype-media-manager-look.md#resolution-2026-10-12) "Search and Collections simplification" and "One bar and automatic adding".

- One row, even on phones: search, the **Collections** dropdown and **More**; 44 px heights, 8 px gap. No Media heading and no separate Add button.
- Collections is a real native `<select>`, progressively enhanced with customizable-select styling, the editor's Phosphor Regular arrow and checkmark; plain native control where unsupported. Long names shorten in the closed control.
- More: **Add new file** first, then kinds (All, Images, Video, Audio, Documents), grid/list, and Manage collections (wired in slice 16).
- Search respects the kind, with a way back to all media when nothing matches. Uses slice 03's filter.

## Done when

- `tests/media-library-filter.test.ts` gains kind-plus-search and recovery cases.
- Nightly cases in `native-media-tab.spec.ts`: search narrows, kind in More narrows, no-results offers All.
- Keyboard: Tab order search → Collections → More; the dropdown works with arrows and Enter.

## Done (2026-10-14)

- **Behaviour.** The Media pane's browse tools are the **One bar**: one row, even on phones, of 44 px controls 8 px apart. **Search** (a pill with Phosphor's magnifying glass, "Search media"), **Collections** (a real `<select>`: All collections, then the library's collections; with `appearance: base-select` it gets a quiet rounded surface, the editor's Phosphor caret and a Phosphor check on the chosen option, and long names shorten in the closed control; other browsers keep the plain native control) and **More** (···: **Add new file**, which opens the file chooser, then a **Show** group of All, Images, Video, Audio, Documents as checked choices). Collections filter by membership (`MediaMetadata.tags`, memberships since slice 05). Search respects the kind and collection (`mediaKind` by extension; Documents are PDFs and every other download; `filterMediaLibrary`, slice 03's filter, now takes `collection` and `kind`). When nothing matches, one button steps back (`mediaLibraryRecovery`): **Search/Show all media** (kind to All, search kept, focus to Search), then **Search/Show all collections**, then **Clear search**. No Media heading (it shows only as the title of compact details), no Upload button, draft note, folder or sort select, tag chips or visible count in the pane; the count stays for screen readers. Escape in the open Collections list closes only the list, not the explorer. Under 540 px search and Collections share the row 1 : 1.2. All of this is in the lazy media chunk except `row-menu`'s new `checked`/`section` items (menuitemradio with a check, titled groups; Files and Pages menus unchanged). The Choose image modal keeps its header, Upload images… and Close until slice 18, with search and Collections and no More.
- **Commits.** f6b7b403 claim; cc55d30b One bar; 55d6e415 native-fallback test; close.
- **Tests.** `tests/media-library-filter.test.ts`: collection filter, name order, kind by extension, kind-plus-search for every kind, recovery order (kind, then collection, then search; nothing for an empty filter); folder, tag and sort cases removed with those controls. `native-media-tab.spec.ts` nightly: the bar's three controls 44 px high and 8 px apart at 390, 768 and 1280 with no heading or Add button, Tab order search → Collections → More, Escape closes the open list but not the explorer, More's items and checked kind, Add new file opens a multi-file chooser; search narrows, a kind in More narrows, no results offer **Search all media** and **Search/Show all collections**; Collections with Enter, arrows and Enter, long names shortened; the same as a plain native select. Existing cases moved from Folder/Sort/tag chips to Collections and kinds (`native-media-tab`, `native-media-pane`), "Search media" label, `native-media-library-keys` fake gained `collections`. `npm run check`, `npm run lint`, unit 2455/2455; browser 125 across the media specs, `native-upload`, `native-file-ops`, `native-history`, `native-page-urls`, `native-make-component-menus`, `native-palette`, `native-asset-references`, `native-image-alt-refusal`: 122 passed; `native-page-urls` "subpages" (publish wait) passed on rerun, and `native-manager-action-fades` "hidden Restore" is the flake slice 09 recorded on untouched dev; media tab, pane and keys 42/42 under CI fonts. Scratch screenshots at 390, 768, 1280 (and dark) with More, the Collections list and no results in the lead's `.scratch/shots/mm-10/`.
- **Review (GPT-6.1 Sol).** No defects; the five scope decisions (List and Manage collections left to slices 12 and 16, folder and sort removed, modal unchanged, membership/extension rules, bytes) accepted. One validation gap, fixed: a plain-native-select case. Nothing rejected.
- **Bytes.** Boot 348 KB gzip of 355 KB. Same-sitting `build:ui` against origin/dev 7c379a8b: entry JS +160 B gzip (`row-menu` choices), entry CSS −75 B (three row-menu rules added; the dropdown rules, previously emitted twice, now once); lazy media chunk JS 10,004 → 10,401 B, CSS 2,974 → 3,334 B gzip.
- **Follow-ups.** Slice 12 adds **List** to More's view choices; slice 16 adds **Manage collections** (last item of Collections) and Rename/Delete collection in More; slice 17 makes Add new file and drops join the viewed collection; slice 18 gives the picker this bar; slice 49's Clean up count belongs in More. The footer ("Drop images anywhere here · …") is untouched.
