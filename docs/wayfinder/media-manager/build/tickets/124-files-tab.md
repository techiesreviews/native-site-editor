---
title: The Files tab, redesigned
type: task (AFK)
status: closed
assignee: claude (mm-124 runner)
blocked_by: [104-media-panel-size]
builder: claude
phase: 9
---

## What

Lex looked at the editor's Files tab (`#explorer-files`) on the preview editor (dark, 1600 px window) and said: "make the file section look better, use mobbin for inspiration". Look only; every existing ability stays.

- Research current file browsers and project file trees on Mobbin first (Google Drive, Dropbox, iCloud Drive, GitHub/VS Code-style explorers in web apps, Framer/Webflow asset panels, Linear/Notion sidebars). References are saved outside the repo in `native-site-editor-private/audit-references/mobbin/124-*`.
- A calm header: title-case heading, a quiet count.
- Clear icons by file type; a consistent row height (about 32–36 px on desktop, 44 px on touch); aligned names; a gentle hover and selected state; actions on hover (desktop) or a ⋯ button (touch); readable in light and dark.
- Keep: dragging a row into the code (slice 111's fade), uploads and the adding tray, rename / move / delete, keyboard use, Recently removed, and the explorer's size from slice 104.
- Share the row and tree styles with the Pages tab (slice 125) where that is sensible, without duplicating.

## Design note

References (Mobbin, saved as `native-site-editor-private/audit-references/mobbin/124-*.webp`): Base44's Files sidebar (`124-base44-files-tree`), Google AI Studio's file explorer (`124-ai-studio-explorer`), v0's code tree (`124-v0-files-tree`), Dropbox's folder tree (`124-dropbox-folders-tree`), Google Drive's list (`124-google-drive-list`), Mintlify's navigation tree with row actions (`124-mintlify-row-hover-menu`), Vapi's dark file list (`124-vapi-dark-files`) and hilos' docs tree (`124-hilos-docs-tree`).

Before (shots in `.scratch/shots/mm-124/before/`): "FILES" in capitals beside a commit code (`69f1d73`) that means nothing to Lex; every file has the same grey page icon; folders have no open/close arrow, so a folder only differs by its icon; the 20 px nesting has no guide; on a phone every folder row carries both + and ⋯; an empty folder's note sits at a random indent.

- **Header** (Base44, Vapi; then slice 125's Pages head, on the lead's request): "Files 46" in sentence case, small and muted, the count a quiet number (its tooltip says "46 files" and the full commit id); a quiet bordered "+ New" at the end, as Pages' "+ New page". The commit code leaves the header (the element stays, hidden, for the specs). Files and Pages share one set of rules in `pages-tree.css` (`.explorer-heading`, `.explorer-heading__count`, `.explorer-new`).
- **Rows** (AI Studio, Dropbox): one row height, 32 px on desktop (`--size-control`) and 44 px on touch (the shared row actions already set this); rows 2 px apart, as every list in the editor.
- **Open and close** (v0, Base44, Dropbox, hilos): a 16 px chevron before each folder, pointing right when closed and down when open; files get the same 16 px slot empty, so every name at one level starts at the same x. The folder icon still switches between closed and open.
- **Indentation** (VS Code-style trees in v0 and AI Studio; Pages' 20 px): `--explorer-indent` (20 px) per level, shared with Pages; a 1 px guide in the line colour runs down each open folder's children under its chevron.
- **Icons by type** (AI Studio, Google Drive): Phosphor file icons by kind: page (`.html`), style (`.css`), script (`.js`), data/settings (`.json`, `.jsonc`, `.yml`, `.xml`, `.webmanifest`), text (`.md`, `.txt`), picture, video, sound, PDF, font, archive, other. Each kind has a soft hue mixed toward the text colour, so it reads in light and dark; text and other files stay muted, folders keep the link colour. The icons load in a small chunk when the explorer first opens (about 2 KB, not in the boot bundle); until then a file shows the plain page icon.
- **Type column** (Google Drive, Vapi; Pages' URL column): on a wide list (container at least 30rem, 36rem on touch) a muted word after the name says what the file is ("Page", "Style", "Picture"…), in the column where Pages shows its URLs (`--explorer-column-at`, every depth lines up), so the wide box reads as a list. Narrow lists drop it.
- **Hover and selected** (AI Studio, Base44; Pages' current page): hover is the shared `--hover` tint over the whole line; the open file is the `--current` tint and semibold, as Pages' current page, and is marked whenever the Files tab comes into view. Change letters (A, M, R, D) become coloured letters without a pill, as code editors show them.
- **Actions** (Mintlify, AI Studio): on desktop the + (folders) and ⋯ fade in at the row's end on hover or keyboard focus, as today. On touch a folder row shows only ⋯ (its menu already has New file, New folder and Upload files), so each row has one 44 px action.
- **Empty states** (Base44, Dropbox): an empty folder says "Empty folder" at the children's name column, muted; an empty repository says "No files yet" and "Drop files here, or use + to add one."
- **Adding tray, drag, rename, Recently removed**: unchanged; the tray keeps its place at the foot of the panel; the drop target keeps its dashed outline.
- **Spacing**: head margins shared with Pages, row padding 4 px at the start and 6 px between chevron, icon and name; on a wide list the name stops 12 px before the type column.

## Done when

- The Files tab follows the design note at 390, 768, 1280 and 1600, light and dark.
- Every existing Files ability still works; the touched browser specs pass.
- Before/after shots (normal, folder open, hover/selected, empty, adding) at 390, 768, 1280, 1600, light and dark.
- `npm run check`, `npm run lint`, unit tests; boot stays within budget.
- Review by GPT-6.1 Sol (read-only `codex exec`) recorded.

## Done (2026-10-16)

- **Behaviour (look only; every ability kept).** The Files tab follows the design note, one family with the Pages tab (slice 125). Head: "Files 46" (small, muted, sentence case; tooltip "46 files" and the full commit id) and a quiet bordered "+ New"; `#revision` stays, hidden. Rows: 32 px on desktop, 44 px on touch; a 16 px chevron slot on every row (a turning chevron on folders), so names at a level line up; 20 px per level (`--explorer-indent`, shared with Pages) with a guide under each open folder's chevron. Icons by type (page, style, script, settings, text, picture, video, sound, PDF, document, font, archive) in soft hues mixed toward the text colour, readable in light and dark; they load as a 2.1 KB lazy chunk when the explorer shows Files and fill the drawn rows in place. On a wide list a muted type word sits in Pages' URL column (`--explorer-column-at`) at every depth. The open file is tinted and semibold and is marked whenever Files comes into view (before, a file opened from Pages was only marked after a redraw). Change letters are coloured letters without a pill (History keeps its pills). Touch: one ⋯ per row (a folder's + is in its menu). "Empty folder" sits at the children's name column; an empty repository says "No files yet" and "Drop files here, or use + to add one." Kept: drag a row into code (step-aside fade), drop/upload and the adding tray, rename (field aligned with the name), move, delete, keyboard (focus paints over the open file's tint), Recently removed, the explorer size from slice 104. Also fixed: a folder opened while the tree redraws stays open from one shared read; stale reads after a branch change write nothing.
- **Shared with Pages.** `pages-tree.css`'s head, count and New rules also name `.explorer-heading`, `.explorer-heading__count` and `.explorer-new`; `.explorer` defines `--explorer-indent` and `--explorer-column-at`, which `.pages-tree` now reads. Pages' look is unchanged (its `native-pages-look` spec passes).
- **Commits.** 7482aeb0 claim; 0157ff5c design note; 78046c06 build; 7231a95c focus paint and spec wait; a967b86d review fixes; c168425c Pages family; 1a16c586 open-file mark; 041c3b7d spec.
- **Tests.** Unit: `tests/file-type.test.ts` (types by name, labels), `tests/files-tree-controller.test.ts` (+5: file count with drafts, empty repository, redraw during a folder read opens it once, a second click during the read, stale resolve/reject after reset). Browser: new `native-files-tab.spec.ts` (head and count, 32 px rows, names lined up, typed icons and one type column across depths, hover actions clear of the column; a rename being typed survives the icons arriving; the open-file mark after opening elsewhere; touch: 44 px rows, one ⋯, folder menu adds, no type word). Touched specs (26 files, 246 tests): 242 passed, then the 4 failures (my spec's redraw race; keyboard focus under the open-file tint, 3 in action fades) fixed and rerun green; after the rebase and the Pages alignment, files-tab, pages-look, action fades, create, explorer size, monaco features, discard, file ops: all passed. `npm run check`, `npm run lint`, unit 3495/3495 (before the rebase).
- **Shots.** `/home/ubulex/Projects/native-site-editor/.scratch/shots/mm-124/before/` and `.../after/` (main checkout, not committed): normal, folder open, hover/selected, empty folder, adding (held mid-way), plus the Pages tab for comparison, at 390 (touch), 768, 1280 and 1600, light and dark. Scenario: `.scratch/files-tab-shots.spec.ts` in the slice worktree (copied beside the shots).
- **Review.** GPT-6.1 Sol, read-only, three times (`/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-124/review-1/`, `review-2/`, `review-3/`). Fixed 4 (+1 found while testing): icon arrival redrew the tree and dropped a rename in progress (now fills rows in place); the tooltip lacked the full commit id; a folder could render twice when clicked during its redraw's read; stale reads cleared current folder state (and wrote the listing cache after reset). Review 2: none. Review 3 (after the Pages alignment): none; its validation gap (mark after opening elsewhere) added as a spec. Rejected: none.
- **Bytes.** 352 / 355 KB before first preview paint after rebasing on slices 123 and 125 (351 before them); this slice adds about +0.3 KB gzip to boot (the shared icon helper now sits in its own small `icons` chunk); the type icons are a lazy 2.1 KB chunk.
- **Follow-ups for the lead.** Pages and Files could share one stylesheet name for the explorer family (today the shared rules live in `pages-tree.css`). The Files tab shows the plain file icon until the explorer first opens on Files (by design, to keep boot small).
