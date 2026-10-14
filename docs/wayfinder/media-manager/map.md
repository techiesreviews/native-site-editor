---
label: wayfinder:map
title: A better media manager
charted: 2026-10-11
tracker: local markdown (tickets live in tickets/ with a blocked_by line in each)
---

## Destination

A decided plan, ready to hand off, for a new **media manager** covering every media file (images, video, audio, PDFs and other downloads). It has a fresh, nicer design inspired by Mobbin. Every upload is optimised in the user's browser. Images get responsive copies. Users can crop images and set a focus point. Unused files are easy and safe to clean up. A fix-all brings old images and images from other websites up to the same standard. Agents may use, place and tidy media but may not add new files. No code changes come from this map. It is done when nothing is left to decide before building starts.

## Notes

- **Planning only.** Tickets produce decisions, not code. Building is handed off once the map is clear. Building happens on `dev` and is deployed with `npm run deploy:preview`, never to production, until Lex says otherwise.
- **Settled while charting (2026-10-11, with Lex):**
  - **What bothers Lex today:** the image screens don't look or feel nice (all of them, nothing singled out), cleaning up unused images is a chore, and responsive images (`srcset`) are missing. Lex likes optimising in the browser on upload and wants to keep it.
  - **A fresh design for all of it**, with Mobbin as the inspiration guide.
  - **All media kinds are in scope:** images, video, audio, PDFs and other downloads, not only images.
  - **Fix-all for existing sites:** the manager finds old images and images loaded from other websites, brings them into the site, optimises them and adds responsive copies. It works page by page or all at once, with Undo.
  - **Crop and focus point are in.** The focus point is set in the **edit bar**, for each place an image is used, because the right spot depends on the place.
  - **Agents** may see media, place and swap it, write alt text, and run the same optimise and clean-up the user can. Adding new media files stays with the user.
- **Direct hosting:** the repo is the site and runs on any static server with no build step. Client JS is allowed. Everything the manager writes must work as plain HTML/CSS in the repo.
- **Facts found while charting (dev, 2026-10-11):**
  - Placing an image from the library already writes `srcset` and a guessed `sizes`, but only when responsive copies exist (`src/page-builder/media-markup.ts:37-74`). It never writes `<picture>` and leaves an existing picture's `<source>` tags alone.
  - The Optimise sheet runs by default in the Images tab (defaults: max width 2400, WebP, quality 80, copies at 480/960/1600, original not kept; `src/page-builder/media-optimise.ts:4,13`). The Structure slot, component panel, Site settings and file tree uploads skip it and store the file as is (`src/main.ts:2443`).
  - Delete unused scans `.html` and `.css` only (`src/page-builder/media-workspace.ts:81`, `media-references.ts:132-170`). It does not scan `.json`, `.js`, `.xml`, `.txt`, `_redirects`/`_headers` or URLs built at runtime.
  - techies-reviews has 533 `<img>` in 118 pages, none with `srcset` or `<picture>`. 158 load from other websites. It has 191 image files (27 MB) under `images/`, including an 11.2 MB GIF.
- **Language:** use the terms in `CONTEXT.md`. *Media file*, *Media manager*, *Optimise*, *Responsive copy* and *Focus point* were added while charting. Add new media terms with the domain-modeling skill as they are settled.
- **Reference sites:** `~/Projects/techies-reviews` (real images in use) and `~/Projects/native-site-editor-starter` (separate project; `fixtures/native-starter` is frozen test data).
- **Existing docs:** `docs/page-builder/media.md`, `images-pane.md`, `asset-references.md`.
- **Grilling tickets** run as a live conversation with Lex, in plain language, one question at a time with AskUserQuestion and options. Lex is not technical. The agent never answers for Lex.
- **Prototype tickets** show Lex something concrete: screenshots or mockups published with `html_render` (Lex often reads from another device). Mobbin is searchable through the `mcp__mobbin__*` tools.
- **Research tickets** are resolved by subagents. Each works in its own git worktree, puts findings on a `research/mm-<nn>-<name>` branch in `docs/wayfinder/media-manager/research/`, and adds a pointer to the ticket.
- **Code reviews** during the build go to GPT-6.1 Sol through read-only `codex exec`. The handoff ticket must say so.
- **To find takeable tickets:** look in `tickets/` for `status: open`, an empty `assignee:`, and every `blocked_by` ticket closed. Claim a ticket by filling in `assignee:` before doing any work.

## Decisions so far

<!-- one line per closed ticket: [title](tickets/file.md): gist -->

- [Research media manager designs on Mobbin](tickets/01-research-mobbin-patterns.md): ~70 screens (image links expire ~2026-11-10); shortlist of eight: Shopify-style detail card with "Used in", Klaviyo before/after optimise, progress on the tile, a thumb-friendly picker, focus point per place with live previews (Squarespace), named crop shapes, grouped clean-up suggestions with Undo or a Trash, a floating bar for many files
- [Research today's media code and what to keep](tickets/04-research-media-code-today.md): two upload paths share no code; responsive copies are loose files that rename/delete ignore; Delete unused misses absolute URLs, JS, sitemap and feed; Undo needs an open page; `media.json` has no room for focus or crop; keep scanner, batch/Undo, Optimise worker and Publish pipeline, split the 455-line view on ten seams, delete the legacy workspace members
- [Research responsive images, crop and focus point in plain HTML](tickets/03-research-responsive-output-crop-focus.md): `<img srcset sizes>` over `<picture>`; one width set per file, `sizes` measured per place plus `auto` for lazy images; the top image loads eagerly; shapes are CSS per place, cutting makes a new file; focus point is inline `object-position`; backgrounds and `og:image` get no copies; today's markup leaves stale `<source>` tags on replace
- [Research the images on existing sites](tickets/05-research-images-on-existing-sites.md): techies-reviews has 77 outside images from 60 sites, a quarter broken; the editor's own security policy blocks them, so fetching needs a new guarded Worker route; 60 unused files (13.4 MB); 490 of 533 images have empty alt; hand-made responsive sets should be adopted; logos, banners, scripts, embeds, sample code and component templates are off limits
- [Research optimising every media kind in the browser](tickets/02-research-optimising-every-media-kind.md): Safari likely uploads large PNGs today (needs a small WebP encoder); keep WebP q80 ≤2400 px, AVIF too slow for a default; HEIC via a decoder loaded on demand; SVG minify, GIF → MP4; video via Mediabunny to H.264 MP4 + poster, audio to AAC; PDFs kept as is; 20 MB cap, warnings at 10 MB / 1 MB, repo size shown, no Git LFS

- [Prototype the media manager's look](tickets/06-prototype-media-manager-look.md): Tiles with One bar search/Collections/More and Phosphor dropdown icons, Add new file in More and automatic drop-to-add into the viewed collection, soft photo overlays including hover; Media replaces Images, All opens the dense grid, grid/list and usage remain, shared picker full-screen on phones; collection and file-name rules graduated to ticket 15
- [Decide the one way media gets added](tickets/07-one-upload-path.md#resolution-2026-10-13): automatic browser preparation everywhere, simple presets remembered per site, image families and optional originals, explicit Files destinations respected, tidy names numbered on conflicts, and per-kind limits and failure rules
- [Decide the responsive image output](tickets/08-responsive-image-output.md#resolution-2026-10-13): plain `<img srcset sizes>` in one format with no fallback; `sizes` measured at phone/tablet/desktop plus `auto` for lazy images; first-screen images load first; replacing inside `<picture>` cleans it up; older images get copies when placed; backgrounds one file; Social image gets a 1200 × 630 JPEG sharing copy
- [Prototype crop and the focus point](tickets/09-prototype-crop-and-focus.md#resolution-2026-10-13): one Image button opens a Brizy-style popup (shape menu, focus dot, Replace, zoom, turn, simple trim, previews) following the editor's look, plus a WordPress 7.1-style large editor; shape and focus change only the place, trimming/zoom/turn/flip make a trimmed copy for that place; replace keeps shape and re-centres; re-crop starts from the original; components open on their own shape; Social image uses the same popup at 1200 × 630
- [Decide how unused media is cleaned up safely](tickets/10-safe-clean-up.md#resolution-2026-10-13): any mention anywhere in the site counts as a use; an Always keep mark protects files used from outside; clean-up offers unused files, unused trimmed copies and leftover smaller copies; a count badge on the Media tab; removed files stay in Recently removed for 30 days (GitHub history, or the browser for folders); removing a used file warns with its pages, then allows; families are removed and restored together
- [Decide the fix-all for existing images](tickets/11-fix-all-existing-images.md#resolution-2026-10-13): Improve images in Media's More lists pages and components with what would change; fix one or all, Undo per page plus Undo all; the browser fetches outside pictures (security policy widened, unfetchable ones left and listed); heavy files get new lighter files and the old ones go to Clean up; GIFs become looping video; logos, embeds, script pictures and sample code left alone; alt text decided later
- [Decide how video, audio and documents are handled](tickets/12-video-audio-and-documents.md#resolution-2026-10-13): own videos show a still picture and play on tap with a site-styled bar (all buttons, subtitles, chosen still); any video can loop silently with a corner pause button, paused for reduced motion, also in picture spots and backgrounds; YouTube/Vimeo pasted, picture copied in, loaded on tap under the same bar, listed in Media, and old YouTube players offered in Improve images; audio gets a site-styled play/timeline/time player; downloads are first-page cards that open the PDF; Image in the Add panel becomes Media; canvas stays still with play to check
- [Decide what agents may do with media](tickets/13-what-agents-may-do.md#resolution-2026-10-13): agents work through the open editor as unsaved changes with no extra Yes/No; they list, preview, place, swap, frame and trim, run Improve images (outside pictures and YouTube switch-overs stay with Lex), reuse Online videos already in Media, write subtitles, remove unused files and used ones only after swapping them out, add but never remove Always keep, and may change preparation settings; never upload, fetch or generate media; descriptions per file with per-place overrides, empty ones count as not described yet until marked Decorative, agent-written text marked in a To check list; one Media chapter in the conventions copied into `AGENTS.md`
- [Decide how collections and file names behave](tickets/15-collections-and-file-names.md#resolution-2026-10-14): collections work like tags; take out of a collection and Remove file are separate; deleting a collection keeps its files; rename/delete from More or a Manage collections list, no combine; named folders (not date folders) become starting collections; renaming changes the real file name for the whole family and every mention, suggests a number when taken, and offers "Keep the old address working" (on for Always keep); Replace everywhere puts a new picture under the old name with a "new version" mark; agents may rename and manage collections
- [Write the handoff plan](tickets/14-handoff-plan.md#resolution-2026-10-14): 82 slices in eight stages in `build/` (groundwork, Media screen, adding and page pictures, image popup, clean-up and renaming, video/audio/downloads, Improve images, sub-folder sites); Sol builds most and reviews everything through read-only `codex exec`, Claude builds the screens; preview only, one screenshot set per stage, no pauses, agents gain abilities stage by stage, Lex checks iPhone/Safari from a list; sub-folder sites follow the site's address, site-wide

## Not yet specified

Nothing. The map is done; building follows [build/README.md](build/README.md).

## Out of scope

<!-- closed tickets ruled beyond the destination, with a one-line reason -->

- Agents adding new media files (uploading, fetching from the web or generating images). Lex decided on 2026-10-11 that adding files stays with the user.
