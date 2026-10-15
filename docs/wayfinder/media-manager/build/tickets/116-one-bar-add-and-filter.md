---
title: "Media's One bar: a + button and one Filter menu"
type: task (AFK)
status: closed
assignee: claude (mm-116 runner)
blocked_by: [107-tiles-list-phone-bar]
builder: claude
phase: 8
---

## What

Lex's answers to the audit's [Q1 and Q2](../ux-ui-audit.md#questions-for-lex) (2026-10-15).

- A visible "+" button in Media's One bar, beside More, opens the file chooser (same path as "Add new file"); dropping files anywhere still adds them. 44 px target; label "Add files" for screen readers. "Add new file" leaves More.
- The Collections menu becomes **Filter**: collections first, then Show (All, Images, Video, Audio, Documents) and View (Grid, List). Its trigger shows the active choice in short ("All", "Garden · Video").
- More keeps only the tools: Clean up, Improve images, To check, Recently removed, Adding settings (with their counts).
- The picker gets the same + and Filter where it lists media.

## Done when

- Specs: + opens the chooser and the added file shows at the top (slice 103); Filter switches collection, kind and view; More has exactly the five tools.
- Shots of the One bar, Filter open and More open at 390, 768 and 1280, light and dark, before and after (`scripts/agents/shots.sh`).
- `npm run check`, `npm run lint`, unit tests, the touched browser specs; new code stays lazy (boot budget unchanged).
- Review by GPT-6.1 Sol (read-only `codex exec`) recorded.

## Done (2026-10-15)

**Behaviour.**
- Media's One bar is search, then one group: **Filter**, **+** and **More** (shared 1 px borders, no gaps; each a 44 px target). On the same row as before, at every width.
- **+** ("Add files" for screen readers) opens the file chooser, the same path as the old "Add new file"; dropping files anywhere still adds them. Added files lead the grid and wear slice 103's ring. The empty library says "Drop files here, or use + to add them."
- **Filter** replaces the Collections select (a menu button on the shared row menu): Collections (All collections, each collection, Manage collections…), then Show (All, Images, Video, Audio, Documents), then View (Grid, List). Its button names the choice in short: "All", "Garden", "Video", "Garden · Video" (accessible name "Filter: …"). While it narrows the view, it wears the chosen colour (`--current`), as an active filter does in Apple Photos. This comes from the choice itself, so a collection named "All" counts.
- **Phones** (pane container ≤ 540 px, picker ≤ 580 px): Filter is the funnel alone while nothing narrows, so search keeps 172 of 310 px (55.5 %, slice 107's ≥ 55 %). Once something narrows, its words replace the funnel ("Garden ·…") and the group may take up to 55 %, so search keeps at least about 42 %. With "All" as the label next to the funnel, search would have been about 50 %, which is why phones show the funnel alone.
- **More** keeps only the tools, in this order: Clean up, Improve images, To check, Recently removed, Adding settings (with their counts). Rename/Delete collection left More: Manage collections (in Filter) has both for every collection, and the view still follows a rename. More hides when a host has no tools.
- The Filter and More menus wrap long collection names and scroll inside the window (30 collections on a phone).
- **The picker** has the same + and Filter (Show only for every-kind pickers such as Add → Media). Its More holds Adding settings. Slice 113's "Paste a YouTube or Vimeo link" sits between search and the group, and on phones on its own row.
- Docs: `docs/page-builder/images-pane.md`, `media.md`; the build spec's One bar line and stage-1 iPhone list note this slice.

**Commits.** ece1ebc6 claim; 8da547d0 status; 4ac98b7f build (rebased over slices 111, 110, 118 and 113; 113's paste button merged into the group's row); 95ee948a spec; 3cfd1a02 review fixes; 67aff800 phone label room, picker overflow spec, build spec notes.

**Tests.**
- Unit: `filterSummary` and Show's order (`tests/media-library-filter.test.ts`). Unit 3465/3465; `npm run check`, `npm run lint` pass.
- Browser: new helper `tests/native-save/media-filter.ts` (`filterTo`, `filterButton`, `collectionChoices`). Rewritten or added:
  - native-media-tab: group geometry at 390/768/1280, keys, More's five tools, + opens a multiple chooser, and Filter's keys and short names with a long collection.
  - native-media-tiles: phone search ≥ 55 %, narrowed words whole, ≥ 40 % then. New: 30 collections plus a collection named "All".
  - native-media-collections: + path, and rename/delete of the viewed collection through Manage collections' ⋯.
  - native-media-picker: the picker's Filter/+/More. New: a phone picker with 30 collections.
  - native-media-screen, native-media-newest, native-media-video, native-media-pane, native-explorer-size, native-mcp-media, native-upload.
- Runs after the last rebase: 13 media spec files, 152/153 passed. The one failure is native-media-newest's "in the picker a file just added leads the grid…": at 390 px the pinned edit bar covers the hero image, so the opening double-click never lands. It fails 4/4 on origin/dev f0255b31 too, so it is not from this slice. Before that rebase, the 11 touched files passed with the CI fonts: picker, tiles, tab and collections; the picker and tiles reruns passed 15/15 in both fonts.

**Shots.** `/home/ubulex/Projects/native-site-editor/.scratch/shots/mm-116/{before,after}/` (main checkout, not committed). There are 6 states × 390/768/1280 × light/dark on the real starter with collections Garden and Studio picks:
- the One bar
- Filter (before: Collections) open
- More open
- Garden + Images chosen
- the Add → Media picker (after: with the paste link)
- the picker's Filter open

`geometry-*.json` records the bar. Before: search 57 % on phones, More with 15 items. After: search 55.5 %, More with 5.

**Review.** GPT-6.1 Sol, read-only (`/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-116/`).
- review-1 found three P2s, all fixed: Filter's menu had no height cap (it now scrolls in the window); a collection named "All" did not narrow (narrowing now comes from the choice); the specs used Rename/Delete buttons that slice 111 had moved behind each collection's ⋯. Its two gaps became tests.
- review-2-pre-fix-head ran against the commit before the fixes (a timing slip). It repeats the same three, and confirms the workspace already held the fixes.
- review-2 (b8e52a77): no defects. Its gap became the phone picker test, and its nit led to the build spec notes.
- Rejected: none. The runs' nested `codex exec` failed on the read-only sandbox, which is harmless.

**Bytes.** Boot unchanged: 349 KB of 355 KB before first preview paint (index.js 227 KB). The new code is only in the lazy media chunks (`media-picker`, `media-library-online`). The funnel is a CSS mask in the lazy media CSS, and + reuses the existing `plus` icon.

**Follow-ups.**
- native-media-newest "in the picker a file just added…" fails on dev at 390 px: the edit bar covers `.hero img`.
