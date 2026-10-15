---
title: The Files tab, redesigned
type: task (AFK)
status: open
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

- **Header** (Base44, Vapi): "Files" in title case at the panel's title size, then a quiet count, "48 files", in the muted small type with tabular digits; the + stays at the end. The commit code leaves the header (the element stays, hidden, for the specs and History; its full id moves to the count's tooltip). The heading style is a shared class, `.explorer-heading`, that the Pages tab (slice 125) can take as is.
- **Rows** (AI Studio, Dropbox): one row height, 32 px on desktop (`--size-control`) and 44 px on touch (the shared row actions already set this); rows 2 px apart, as every list in the editor.
- **Open and close** (v0, Base44, Dropbox, hilos): a 16 px chevron before each folder, pointing right when closed and down when open; files get the same 16 px slot empty, so every name at one level starts at the same x. The folder icon still switches between closed and open.
- **Indentation** (VS Code-style trees in v0 and AI Studio): 16 px per level, one chevron's width, so a child's chevron sits under its parent's icon; a 1 px guide in the line colour runs down each open folder's children under its chevron.
- **Icons by type** (AI Studio, Google Drive): Phosphor file icons by kind: page (`.html`), style (`.css`), script (`.js`), data/settings (`.json`, `.jsonc`, `.yml`, `.xml`, `.webmanifest`), text (`.md`, `.txt`), picture, video, sound, PDF, font, archive, other. Each kind has a soft hue mixed toward the text colour, so it reads in light and dark; text and other files stay muted, folders keep the link colour. The icons load in a small chunk when the explorer first opens (about 2 KB, not in the boot bundle); until then a file shows the plain page icon.
- **Kind column** (Google Drive, Vapi): when the panel is wide (container at least 640 px), a muted, fixed-width label after the name says what the file is ("Page", "Style", "Picture"…), so the wide box reads as a list, not a strip of names. Narrow panels drop it.
- **Hover and selected** (AI Studio, Base44): hover is the shared `--hover` tint over the whole line; the open file is the `--current` tint, medium weight (500, no bold width jump). Change letters (A, M, R, D) become coloured letters without a pill, as code editors show them.
- **Actions** (Mintlify, AI Studio): on desktop the + (folders) and ⋯ fade in at the row's end on hover or keyboard focus, as today. On touch a folder row shows only ⋯ (its menu already has New file, New folder and Upload files), so each row has one 44 px action.
- **Empty states** (Base44, Dropbox): an empty folder says "Empty folder" at the children's name column, muted; an empty repository says "No files yet" and "Drop files here, or use + to add one."
- **Adding tray, drag, rename, Recently removed**: unchanged; the tray keeps its place at the foot of the panel; the drop target keeps its dashed outline.
- **Spacing**: header 12 px above and 8 px below (shared with Pages), row padding 4 px at the start and 8 px between chevron, icon and name.

## Done when

- The Files tab follows the design note at 390, 768, 1280 and 1600, light and dark.
- Every existing Files ability still works; the touched browser specs pass.
- Before/after shots (normal, folder open, hover/selected, empty, adding) at 390, 768, 1280, 1600, light and dark.
- `npm run check`, `npm run lint`, unit tests; boot stays within budget.
- Review by GPT-6.1 Sol (read-only `codex exec`) recorded.
