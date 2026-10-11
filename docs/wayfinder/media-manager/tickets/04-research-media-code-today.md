---
title: Research today's media code and what to keep
type: research (AFK)
status: closed
assignee: claude (research subagent)
blocked_by: []
---

## Question

Map everything in the editor that touches media files today, so later tickets and the handoff know what to keep, merge and delete. Cover: every entry point (edit bar Choose image… and alt text warnings, canvas double-click and drop, the Images tab, Structure slot and component panel Upload image…, Site settings image upload, file tree uploads and drops) and which code path each takes; `src/page-builder/media-library-view.ts` (what it does, how dense it is, natural seams to split it on); the legacy parts of `media-workspace.ts`; `media-optimise.ts`, `media-markup.ts`, `media-references.ts`; `.editor/media.json` (its shape and what it stores); how bytes go from IndexedDB through Publish and `/api/blob`; how rename rewrites references; how Delete unused decides (and every blind spot: `.json`, `.js`, `.xml`, `_redirects`, runtime URLs, component templates, files in folders other than `images/`); how Undo groups media actions into one draft batch; the MCP tools in `worker/mcp.ts` and the site conventions text about images; the unit and e2e tests that cover media; and `docs/page-builder/media.md`, `images-pane.md`, `asset-references.md`. Give file:line references and end with a list of what is reusable as is, what needs reshaping, and what is dead.

## Resolution (2026-10-11)

Full findings: branch `research/mm-04-media-code-today` (commit 2d97d703), file `docs/wayfinder/media-manager/research/04-media-code-today.md`.

1. **Two upload paths share no code.** The Images tab, Choose image and a file dropped on a canvas image are optimised, get responsive copies and make one Undo step. Structure slots, the component panel, Site settings and the Files tab go through `uploadFilesTo` (`main.ts:2443`): stored as is, no copies, no Undo. Choosing an image with a new upload takes two Undo steps.
2. **`media-library-view.ts` is one closure of about 455 lines** with about 20 shared state variables. It splits on ten seams: shell, busy lock, image cache, refresh and focus, filter and sort, grid, details, delete, Optimise, input. Responsive copies (`-480w`) show as separate cards, because nothing groups them.
3. **Rename and delete ignore the copies.** After a rename, placing the image no longer adds `srcset`; a delete leaves the copies behind.
4. **Delete unused reads only `.html` and `.css` and misses absolute URLs.** Both reference sites write `og:image` as a full `https://…` address, so the social card can look unused. techies-reviews also names images in `scripts/prebuilt-code.js`, `sitemap.xml` and `feed.xml`, which are never read. Files outside `images/` are covered.
5. **Undo for library changes belongs to the open page.** The Images tab refuses to change anything when no editable page is open (`main.ts:2527-2529`).
6. **`.editor/media.json` holds only tags and a default alt text per path.** Neither reference site has one. It has no place for a focus point, crop or copies.
7. **Agents have no media tools.** They see binary files only as path, SHA and size through `export_site`.
8. **Keep:** the reference scanner, the batch-and-Undo engine, the browser Optimise worker, the IndexedDB → `/api/blob` → Publish pipeline. **Reshape:** one upload path, image families (an image with its copies), `<picture>` and focus output, wider unused scanning, the preview's separate image scanner, the `media.json` shape, the docs (`media.md` and `asset-references.md` are partly out of date). **Delete:** the legacy `write`/`changed`/`rename`/`remove` members, the optional `applyBatch`/`assetVersion` checks, and the uncalled workspace `rewrite` and `upload`.
