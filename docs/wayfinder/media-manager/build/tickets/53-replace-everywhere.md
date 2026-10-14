---
title: Replace everywhere
type: task (AFK)
status: closed
assignee: claude (mm-53 runner)
blocked_by: [46-wide-use-scanner, 48-recently-removed]
builder: sol
phase: 4
---

## What

Ticket [15](../../tickets/15-collections-and-file-names.md#resolution-2026-10-14) "Replace everywhere".

- The new picture is prepared as at adding and takes over the old file's name and address, with its own responsive copies; the old picture goes to Recently removed.
- Each mention gets a quiet "new version" mark on its address so browsers fetch the new picture at once: `?v=` plus a short hash of the new bytes ★.
- Each place keeps its shape and focus, re-centred; places using a Trimmed copy of the old picture switch to the new picture in the same shape.
- If the type changes (`.jpg` → `.webp`), the base stays, mentions are updated, and Always keep files forward from the old address.

## Done when

- `tests/replace-everywhere.test.ts`: same name and address, version mark on every mention, copies remade, trimmed places switched, type change with forwarding for Always keep.

## Done (2026-10-14)

- **Behaviour.** The engine behind Replace everywhere; no button yet (slice 54 calls it). `createMediaWorkspace().replace({ path, result, original?, keepOldAddress?, live? })` returns the new main path; the rules live in the new lazy module `src/page-builder/replace-everywhere.ts` (`planMediaReplace`). One batch, one Undo step, label "Replace everywhere".
  - **Same name and address.** The prepared picture (main plus its own responsive copies, and a kept original when given) is written over the old family's addresses; old members without a counterpart (a copy width the new picture lacks, an original of another type) are deleted. The draft transaction gained explicit `overwrites` (each needs a captured asset revision and no overlapping delete), so new bytes can replace an existing path.
  - **Old picture to Recently removed.** The whole old family gets one entry (Git blob SHA, or a browser copy), including members whose address the new picture now holds; restoring it while the address is taken refuses as "already exists" (accepted ★).
  - **"New version" mark ★.** Every mention 52's rewriter finds (HTML incl. `srcset`/`data-src`/`imagesrcset`, inline scripts, JSON-LD, own-domain `og:image`, CSS, JS `\/`, JSON, sitemaps/feeds, SVG, Markdown, and `_redirects` destinations) gets `?v=` + the first 8 hex of the Git blob SHA of the file it points to; an existing `v` is replaced, other query parameters, `#hash`, encoding and `&amp;` kept. `_redirects` sources and `_headers` are left alone; new forwarding lines (type change) stay plain since their addresses were never cached. 52's `rewriteText` is shared via `rewriteMediaMentions`/`rewriteMediaRedirects` with optional `versions`; rename behaviour unchanged.
  - **Copies.** A `srcset` entry for a vanished copy width is dropped (when it was the only one, the new main takes its place); the main's `w` descriptor follows the new width; other mentions of a vanished copy point to the main. No new `srcset` entries (slice 33).
  - **Shape and focus ★.** `<img>` places keep inline `aspect-ratio`/`object-fit`; an inline `object-position` becomes `50% 50%`; other declarations untouched. Places with no inline shape (Original) keep `width` and get `height` from the new picture's ratio.
  - **Trimmed copies.** Places showing a Trimmed copy of the old picture switch to the new family with its marks and get `aspect-ratio: W / H; object-fit: cover; object-position: 50% 50%` from the trimmed copy's `width`/`height` attributes or its real pixel size (small header reader for PNG/GIF/JPEG/WebP/AVIF). A trimmed family no text mentions afterwards, and not Always keep, goes to Recently removed in the same batch; a kept one keeps its record with `trimmedFrom.source` following.
  - **Type change.** `.jpg` → `.webp` keeps folder and base; mentions are rewritten; with `keepOldAddress` (default: Always keep on any family member) `_redirects` forwards the old main and copies (a copy without counterpart to the main). A new address taken outside the family refuses.
  - **Records.** The main's record (collections, description, Decorative, Always keep, places, agent marks) and records of copies/original with a counterpart stay on the new addresses.
  - **Guards.** Captured revisions of the old family and affected trims; every text file read (unreadable refuses); `_redirects` changed since it was read refuses; non-main, Trimmed copy, SVG, animated, or malformed prepared results refuse. Slice 08's page-text guard applies (no page open refuses).
- **Commits.** c0708e10 claim; 6e38a0e3 build (Sol); 482b873d round-1 fixes; afcad925 round-2 fixes; then this close.
- **Tests.** New `tests/replace-everywhere.test.ts` (25 cases: same name and address, marks in every file kind and spelling, `_redirects` destinations, copies remade and pruned incl. a lone `srcset`, shapes/focus/Original height, trimmed places by attributes and real size, component-relative places, type change and forwarding by Always keep on main or copy, taken paths, kept originals, refusals, header reader, records of kept copies). Extended `media-workspace` (one batch and Undo with old blob SHA in Recently removed, revisions captured, unreadable/cancelled refuse, browser-only bytes, animated refuse, kept copy record survives, `_redirects` changed mid-replace refuses) and `media-draft-transaction` (overwrite over a branch path and an upload with Undo/Redo; ordinary uploads still refuse taken paths). `npm run check`, `npm run lint`, unit 2724/2724. Full suite (`full-suite.sh 3`) on 6e38a0e3: 960 passed, 15 failed (all 13 `native-media-pane` with "Open a repository before choosing an image", `native-canvas:130`, `native-selector:486`); rerun of those three specs on afcad925: 40/40 passed.
- **Review (GPT-6.1 Sol), 2 rounds.** Logs: `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-53/round-{1,2}/` (`run.log`, `result.md`). Round 1, fixed (3 P2): a lone `srcset` candidate could be emptied; forwarding default looked only at the main's Always keep; copies lost their records. Round 2 verified those and found 2 P2, fixed: `_redirects` destinations had no mark; a `_redirects` change during preparation could hide a trim's use. Rejected: none (round 2's "version generated forwarding destinations" kept plain on purpose: those addresses are new, never cached).
- **Bytes.** `test:budget` 344 KB gzip before first preview paint of 355 KB, unchanged from dev; the new code is in the lazy workspace and `replace-everywhere` chunks.
- **Follow-ups.** Slice 54: picker → `prepareMediaFile` → `workspace.replace`, with the "Keep the old address working" tick for type changes and plain messages for the refusals. Slice 55: agents replace only with a file already in Media (pass its family's bytes as `result.outputs`). Slice 38 can absorb the small style-declaration helpers here. A same-type replace that drops an Always keep copy width forwards nothing (its address disappears); Recently removed holds it.
