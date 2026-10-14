---
title: Usage badges and the list view
type: task (AFK)
status: closed
assignee: claude (mm-12 runner)
blocked_by: [10-one-bar, 11-usage-records]
builder: claude
phase: 1
---

## What

Ticket [06](../../tickets/06-prototype-media-manager-look.md#resolution-2026-10-12) "Usage" and "Opening and views".

- A numbered badge on each tile counts distinct pages; hover or keyboard focus expands it to **Used on X pages**; tapping opens the usage text and page names.
- A checked file with no uses: **0** expanding to **No uses found**. Other uses and **Not checked yet** are shown apart.
- Usage and selection targets at least 44 px and never overlapping.
- The **list view** (from More) shows name, file size and usage.

## Done when

- `@smoke` `tests/native-save/native-media-screen.spec.ts`: Media opens on All with one tile per family, a used image shows its page count, hovering reads "Used on 1 page", the list view shows its size.
- Nightly: 0 / No uses found, Not checked yet, tap opens page names.

## Done (2026-10-14)

- **Behaviour.** Each tile's top-left badge now reads the site's usage check (slices 11/46, checked on open) through a new optional `usage` source on the media host (`MediaPickerHost.usage`: `records()`, `onChange()`), wired in `main.ts` to the media controller's `usageRecords`/`onUsageChange`. The number counts distinct pages of the whole Image family; **?** while Not checked yet (pages found so far are never shown as a count), **0** with **No uses found**, and **0** with **0 pages · Other uses found** when only other files mention it. Hover or keyboard focus opens the words below the two top controls, inside the tile, on the name's soft dark background with sharp text (a clean surface on files without a preview); the words are the badge's accessible name. A tap (or click) opens a usage dialog inside the explorer: the file name and the usage words, **Pages · N** with each page by its path (each opens that page), **Other uses · N** with each file and where it was found in plain words (Style sheet, Sharing preview, Feed or sitemap, Notes…), and while unchecked "The site's files are still being checked." or the unreadable files; **File details** and **Close**. Escape closes only the dialog, focus returns to the badge. Newer check results repaint the badges and an open dialog in place (thumbnails and focus stay; a focused page link keeps focus). More gains a **View** group, **Grid** or **List**; the list shows each file's selection, thumbnail, full name (wrapping, never shortened), size and usage (number and words), with the size under the name on phones. `mediaUsageFor`/`mediaUsageState` moved to the dependency-free `media-usage-text.ts` (re-exported from `media-usage.ts`) so the Media chunk does not load the scanner. The details sheet keeps its own "Used on N pages" list (slice 14) and no longer has a usage-focus mode; Delete unused still uses the legacy usage (slices 47/50). The Choose image modal gets the same badges (no More, so no list).
- **Commits.** 4e5500f2 claim; ac045f00 badges, usage dialog and list; 6158bf9f list size with the name on phones; c7c757f5 review fixes; close.
- **Tests.** New `tests/media-usage-text.test.ts` (one page vs several, 0 / No uses found, other uses only, unchecked is "?" even with pages, no records and unreached paths, family members share a record, other-use words). New `tests/native-save/native-media-screen.spec.ts`: `@smoke` Media opens on All (and Grid), a used image shows 1, hover reads "Used on 1 page", the list shows name and size; nightly 0 / No uses found on hover and keyboard focus with the words below the controls and inside the tile; tap on a phone opens the page names, Escape keeps the explorer and returns focus, a page name opens the page; Not checked yet then a newer result repaints badges and the open dialog, keeps focus on a still-listed page, other uses apart, File details; a long name in full on a phone list; list targets 44 px and apart at 390 px with no sideways scroll, back to Grid. Updated `native-media-tab` (focus case badge is Not checked yet without a source; family tile case uses real `mediaUsageRecords`) and `native-manager-action-fades` (badge opens the usage dialog). `npm run check`, `npm run lint`, unit 2460/2460; browser: media screen, tab, pane, library, library keys, transaction, fades, asset references, upload, alt refusal, palette 90/90 (before the review fixes) and media screen 6/6 after; CI fonts media screen, tab and fades 46/46; smoke 43/43. Scratch screenshots at 390 (touch), 768, 1280 and 1280 dark (grid, badge words, other uses, usage dialog, More, list) in the lead's `.scratch/shots/mm-12/`.
- **Review (GPT-6.1 Sol).** 2 fixed: list names were shortened although ticket 06 asks for full names in the list (now wrap); a newer usage result rebuilt the dialog and dropped keyboard focus from a page link (now restored). Both suggested specs added. Nothing rejected. No re-review: the fixes are two small, tested changes.
- **Bytes.** Boot 348 KB gzip of 355 KB. Same-sitting build against origin/dev 3dac05f3: entry JS +77 B gzip (the usage source wiring in `main.ts`), entry CSS ±0; lazy media chunk JS 10,401 → 11,290 B, CSS 3,334 → 4,128 B gzip (before the review fixes; they add a few bytes).
- **Follow-ups.** Page names are page paths, as in details; showing page titles needs the host to pass them (slice 14 or 18). Slice 14 can drop the details sheet's legacy usage list in favour of these records. On phones the list's usage words take about 6.5em, so very long names wrap to several lines.
