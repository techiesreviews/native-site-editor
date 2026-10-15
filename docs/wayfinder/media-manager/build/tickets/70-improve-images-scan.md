---
title: Improve images - what would change, per page and component
type: task (AFK)
status: closed
assignee: claude (mm-70 runner)
blocked_by: [46-wide-use-scanner, 35-copies-for-older-images]
builder: sol
phase: 6
---

## What

Ticket [11](../../tickets/11-fix-all-existing-images.md#resolution-2026-10-13) "Where and how" and "Left alone"; research [05](../../tickets/05-research-images-on-existing-sites.md#resolution-2026-10-11).

- A pure plan: rows for pages, and components as their own rows with their reach ("Site header, on 104 pages: 2 heavy pictures"), each listing what would change: outside pictures to bring in, heavy files to lighten, missing copies, `width`/`height`, `sizes`, loading order, GIFs to Looping video, YouTube/Vimeo players to "picture until tapped".
- **Left alone**: SVG logos and icons (they only get `width`/`height`), YouTube embeds' stills in structured data, pictures swapped in by scripts, sample code inside articles, component templates' own fallbacks. Descriptions are not part of it.
- Hand-made responsive sets are adopted, not duplicated (slice 35).
- Pictures Lex unticks are remembered as left as is ★ (in `.editor/media.json`).

## Done when

- `tests/improve-images.test.ts` on a techies-reviews-like fixture: rows and reach, every change kind, the left-alone list, adopted sets, unticked pictures skipped.

## Done (2026-10-15)

- **Behaviour.** New pure, DOM-free, lazily loaded `src/page-builder/improve-images.ts`: `improveImagesPlan({ sources, pages, components, files, records, site })` decides what Improve images would change and changes nothing. Nothing imports it yet (slices 71–74 do).
  - **Rows**: one per page and one per component template with work. A picture belongs to the file it is written in (slot fills on a page belong to the page). Components carry `reach` (pages that show them, nesting included) and their pages. Labels: component name ("Site header"), the page's `<title>` up to the first " · ", " | " or " - ", "Home", or the page address. `summary` reads "Site header, on 97 pages: 2 pictures missing copies, …" / "Resources: 64 pictures from other websites, …". Components first by reach, then pages.
  - **Pictures** carry `key` (repo path, or the absolute outside address), `address`, `path`/`url`/`host`, `kind`, the start-tag range for slices 71–73, `link` (an enclosing `<a>`, e.g. affiliate banners; the link stays), `adopted` (existing set kept), `videoId`, `changes`, `ticked`.
  - **Changes**: `bring-in` (outside raster), `lighten` (own raster over 200 KB ★, wider than the site recipe's max width, or BMP/TIFF; includes new copies), `copies` (no family copies, wider than 480, via slice 35's `olderCopyWidths`), `size` (missing width/height; the only change for SVGs), `sizes` (srcset or new copies without `sizes`), `loading` (neither `loading` nor `sizes`; `sizes` marks editor-placed images, slice 33), `loop` (animated GIF; unknown animation counts as animated ★), `first-frame` (a GIF `og:image`), `player` (YouTube embed/watch/youtu.be/shorts/nocookie iframes, Vimeo player with `?h=`). Other iframes are not listed.
  - **Left alone** (per row, with reason): `script` (`data-src`/`data-srcset`, or an `id`/`data-*` hook on the picture or an ancestor, or the picture's own class in a selector string or `getElementsByClassName`, named by a script the page loads), `sample-code` (inside pre/code/samp/kbd/xmp/textarea/template/noscript), `structured-data` (JSON-LD image addresses), `template-fallback` (inside a template's `<slot>`), `missing` (own file not in the repo). CSS backgrounds are not scanned (spec: out of scope). Descriptions are never part of it.
  - **Adopted sets**: family copies, the `<img>`'s own `srcset` and its `<picture>` `<source>` sets are adopted (no `copies`); `<source>` tags are not pictures of their own.
  - **Unknown facts**: a raster with unknown bytes or width gets no `lighten`/`copies` and is listed in `missingFacts` so the screen reads it first ★.
  - **Unticked pictures ★**: new `leftAsIs: { picture, row? }[]` in `.editor/media.json` (`shared/media-records.ts`: validated, deduplicated, serialized after `adding`, moved by `renameMediaRecord`; `setPictureLeftAsIs`). No `row` means everywhere (an affiliate banner on four articles), else that row only. Unticked pictures stay listed with `ticked: false` and their changes, but count nowhere.
- **Real-site check** (read-only export of techies-reviews `origin/main`, facts from Pillow): 99 pages, 90 rows; 73 outside pictures, 18 heavy, 2 GIFs + 1 GIF sharing picture, 81 players; the home hero still left alone as script-swapped; the 8 hand-made sets on Home adopted; 244 structured-data stills left alone. Matches research 05.
- **Commits.** 446ffde4 claim; 0ece0745 build (Sol; runner fixed `<source>` handling, unrecognised srcset sets adopted, exact id hooks, no size details for GIFs, scripts read once per page); 46613dd5 review fixes; this close.
- **Tests.** New `tests/improve-images.test.ts` (12) on `tests/fixtures/improve-images/` (a techies-reviews-shaped site: script-swapped YouTube hero, hand-made set, outside pictures incl. `http://`, `//` and an affiliate banner, an animated GIF also as `og:image`, YouTube/Vimeo/Maps iframes, sample code, heavy and wide files, SVG icon, missing file, editor-placed image, header/footer/nested shell/card components, `.editor/media.json` with `leftAsIs`): rows and reach, labels and summaries, every change kind, the left-alone list, adopted sets, unticked pictures (everywhere and per row), recipe max width per preset, missing facts, own-domain addresses, tag ranges. `tests/media-records.test.ts` extended for `leftAsIs`. `npm run check`, `npm run lint`, unit 3,044/3,044. No browser spec touched (no UI).
- **Review (GPT-6.1 Sol, read-only), 1 round.** Evidence: `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-70/` (run.log: model gpt-6.1-sol, sandbox read-only; result.md `REVIEW_STATUS: complete`). Fixed 2 (P2): missing facts dropped when the row had no other work; class-selected script swaps not detected (own classes only; container classes are queried by scripts too often, and the real-site scan stayed at one script-swapped picture). Rejected 1 (P2, "`sizes` must not suppress the loading check"): `sizes` is the editor's mark of a placed image (slice 33); first-screen placed images deliberately have no `loading`, and the scan cannot measure the fold, so flagging them would keep every placed image listed forever; slice 72 re-measures every picture it improves. Not re-reviewed: small, tested fixes.
- **Bytes.** `test:budget` 349 KB gzip before first preview paint (budget 355 KB). Boot grows only by the `leftAsIs` parser in `shared/media-records.ts` (a few hundred bytes raw); the plan module is not on the boot path.
- **Follow-ups.** Slice 67: share one YouTube/Vimeo address parser with `onlineVideo` here. Slices 71–73: use `tag` ranges and `adopted`; a hand-made set's heavy main is lightened without making a second set. Slice 74: `leftAsIs` row keys are file paths, so a page moved by Change URL loses its row-specific entries (global ones keep).
