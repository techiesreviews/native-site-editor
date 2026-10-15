---
title: Heavy pictures get lighter files
type: task (AFK)
status: closed
assignee: claude (mm-72 runner)
blocked_by: [70-improve-images-scan]
builder: sol
phase: 6
---

## What

Ticket [11](../../tickets/11-fix-all-existing-images.md#resolution-2026-10-13) "Heavy pictures already in the site".

- A new, lighter file with responsive copies, using the site's remembered image setting (AVIF too if chosen: see the spec's AVIF build check); every mention points at it (pages, components, sharing pictures, sitemap and others).
- The old file becomes unused and is offered by Clean up; Always keep protects one linked from outside.
- Every improved picture gets `width`/`height`, measured `sizes` and the loading order (slice 33).
- Per-page batches, so each page has its own Undo.

## Done when

- `tests/improve-images.test.ts`: new file and copies, every mention repointed, old file left for Clean up, width/height/sizes/loading.

## Done (2026-10-15)

- **Behaviour.** The fix engine for heavy own pictures; no screen yet (slice 74 calls it). New lazy module `src/page-builder/improve-heavy.ts`, entered through `createMediaWorkspace().improve(request, ports?)` (dynamic import, like `replace`).
  - **One row, one batch.** `improve({ row, files, measure?, live?, signal?, progress? })` reads every text file, re-runs `improveImagesPlan` on the current sources and records (earlier tag ranges go stale after another row), and applies the row's own-picture changes (`lighten`, `copies`, `size`, `sizes`, `loading`) as one batch labelled `Improve images: <row label>`: one Undo step per page or component. Unticked and left-alone pictures are never touched; `bring-in`, `loop`, `first-frame` and `player` pictures are left for slices 71 and 73 (`prepareImproveHeavy` returns `{ batch, result }` so they can add to the same batch before the one commit). Returns `{ label, changed, notes }`. `improveRows(workspace, rows, options)` runs Fix all row by row with `onProgress`; Cancel stops inside or between rows with nothing half-applied; finished rows stay done; results are done / unchanged / failed (message) / not started. "Preparing (slower)…" when Smallest files is remembered. Nothing goes live until saved (draft batches).
  - **Lighter file.** Made from the old file's bytes with the site's remembered image setting (AVIF for Smallest files, with slice 28's fallback note), same folder and base name with the recipe's extension, numbered when any family name is taken; old copy names are reserved so they cannot join the new family. Responsive copies as at adding. If the new main is not smaller, the old main stays (with a note) and still gets the copies it lacks. The old file's bytes and record (Always keep included) are untouched; once nothing mentions it, Clean up offers its family, and Always keep still protects it.
  - **Every mention repointed** through slice 52's rewriter (new options: protected ranges, `srcset` width descriptors, one file only): pages, components, own-domain `og:image`/`twitter:image`, sitemaps, feeds, CSS, JS, JSON, Markdown, `_redirects` destinations. Editor-made old copies map to the new copies of the same width (or the new main). Skipped: unticked or script-swapped pictures (with their `<picture>` sources), sample code, JSON-LD, template fallbacks (`improveImagesPlan` now returns `protectedRanges`, also for files with no row). ★ The batch that creates the lighter file repoints every mention outside the files of other rows that list the picture as ticked heavy; those rows repoint their own file in their own batch. ★ New record field `lighterFrom` (follows renames) lets later rows and later runs reuse the lighter file instead of making another. The new file gets the old one's description, Decorative and collections; place records move for the places rewritten.
  - **Hand-made sets adopted** (WordPress sizes, bare-number sets, written `srcset`/`<source>` sets): only a new main; the set's entries stay and the old main's entry takes the new address and width. A set written on one place also serves the same picture's plain places.
  - **Size details.** Every improved picture gets `width`/`height` from the file used, `srcset`, measured `sizes` and slice 33's loading order (first-screen eager, one `fetchpriority="high"` holder, others lazy with `auto, `) through an injected `measure(file, node, image)` port; when it cannot measure, slice 33's fallback (lazy, `auto, 100vw`). SVGs only get `width`/`height`; alt, classes, links and other attributes are kept.
  - **Assumptions (★).** Under AVIF, sharing tags keep the old file (many sharing services cannot read AVIF), so that old file stays in use. Keep original is not applied (the old file stays until Clean up). A component tag that resolves to different files on its pages refuses its row and asks for a site-root address. All JSON-LD is left alone, following slice 70.
- **Commits.** 39b0ff69 claim; 5f74a4e8 build (Sol; runner replaced a `typeof document` parser switch with an injected page-reader port, threaded through `workspace.improve`); 13eab8d3 review fixes; this close.
- **Tests.** New `tests/improve-heavy.test.ts` (15): every mention kind and own-domain sharing, one Undo per row, reuse on a later row, protected places, adopted and written sets incl. across places, AVIF and fallback notes, not-lighter with copies, numbered names, measured priority and fallback, SVG, component template only, relative component addresses, Clean up offers the old family unless Always keep, revision/source drift, unreadable file and cancel refuse the row, runner progress/cancel. `improve-images` (protected ranges) and `media-records` (`lighterFrom`) extended. `npm run check`, `npm run lint`, unit 3,123/3,123. No browser spec touched (no UI).
- **Review (GPT-6.1 Sol, read-only), 1 round.** Evidence: `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-72/round-1/` (run.log: model gpt-6.1-sol, sandbox read-only; result.md `REVIEW_STATUS: complete`). Fixed 2 (P2): copies dropped when the new main was not lighter; a hand-made set on one page left the same picture's other places without `srcset`. Rejected 1 (P2, "AVIF sharing tags must follow, with a JPEG sharing copy"): pointing `og:image` at AVIF breaks link previews on major services, and a slice 36 sharing copy crops to 1.91:1, a visible change Lex has not chosen; left for the lead. Validation gap not taken: out-of-order Undo of an earlier row with a later row kept needs the list's per-row Undo (slice 74); the draft store's Undo is a stack. Not re-reviewed: small, tested fixes.
- **Bytes.** `test:budget` 349 KB gzip before first preview paint (budget 355 KB), as after slice 70. Boot grows only by the `lighterFrom` record field (+5 B gzip); the engine is a lazy chunk (about 7 KB gzip).
- **Follow-ups.** Slice 74: wire `measure` to the preview (open each page; component rows on a page that shows them), drive `improveRows`, and implement per-row Undo from the list (a later row may use a lighter file an earlier row created). Slices 71/73: add their changes to `prepareImproveHeavy`'s batch. Lead: under AVIF, whether sharing tags should get a JPEG sharing copy.
