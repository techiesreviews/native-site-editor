---
title: Pictures from other websites
type: task (AFK)
status: closed
assignee: claude (mm-71 runner)
blocked_by: [70-improve-images-scan]
builder: sol
phase: 6
---

## What

Ticket [11](../../tickets/11-fix-all-existing-images.md#resolution-2026-10-13) "Pictures from other websites".

- The editor's browser code fetches them; no new Worker route. Widen the security policy only for what images need (`img-src` and `connect-src` for `https:` image fetches), in `public/_headers` and the test server alike. Outside pictures then also show in the canvas.
- Only hosts that allow cross-site reading can be brought in. Brought-in pictures follow the adding rules (recipe, copies, `media/images/`, tidy names numbered on conflict), named with the source site first (`mobbin-og-image.webp`).
- A link around the picture stays; only the picture's address changes.
- Pictures that cannot be brought in stay as they are and are listed as **website gone** or **not allowed**; Lex can drop in an own copy to replace one.

## Done when

- `tests/outside-pictures.test.ts`: naming, link kept, gone vs not allowed, the policy widened only for images.
- `tests/editor-csp.test.ts` updated.

## Done (2026-10-15)

- **Security policy.** `img-src` and `connect-src` gain `https:` (nothing else: no `http:`, no `*`, no other directive) in `public/_headers` and `tests/native-save/test-csp.ts`. Outside pictures can be on any host, so slice 67's exact-host list cannot apply; slice 67's four connect hosts stay listed. The canvas leaves outside addresses alone (`assetFor` only maps site files), so outside pictures now show there.
- **Behaviour** (engine only; slice 74's screen calls it). New lazy `src/page-builder/outside-pictures.ts`:
  - `readOutsidePicture`: `//` and `http://` become `https://`; the browser reads with `mode: "cors"`, credentials and referrer omitted, redirects followed; one read per address per run. A readable 200 image (sniffed or `image/*`) is brought in. Readable 404/410/5xx or a non-image body → **website gone**; other readable refusals (401/403/451…) → **not allowed**. A refused read (cross-site reading not allowed, or no website: indistinguishable to the fetch) is probed with an `<img>` load: loads → not allowed, fails → website gone. SVG stays outside. Labels exported as `OUTSIDE_PICTURE_LABELS`.
  - `outsidePictureName`: source site first (`https://mobbin.com/og-image.png` → `mobbin-og-image.webp`; `cdn.mobbin.com` → `mobbin`; `bbc.co.uk` → `bbc`; no stem → the site alone; label not doubled), then the adding rules' tidy name; conflicts numbered by `chooseMediaPath`.
  - `bringInOutsidePictures` per row (page or component file): ticked `bring-in` pictures are prepared with the site's remembered recipe and Keep original into `media/images/` with responsive copies (sharing pictures: no copies, written with `socialImageAddress`; GIF bytes kept, slice 73 converts), and saved with the row's rewrite in **one** `workspace.import` (one Undo step per row; a changed file refuses; Cancel saves nothing). Only the picture's own tag changes (`src`, `srcset` from the copies, `width`/`height`); **a link around it stays byte for byte**. A `<picture>` around it loses its wrapper and sources (ticket 08) with "The brought-in picture is now used on all screens." for art-directed sets. Optional `measure` port (slice 33's preview measurement): measured pictures get their size hint and lazy loading only below the first screen; unmeasured ones get `sizes="100vw"` and keep their loading as written (a first-screen hero is never made lazy). A shared `brought` map brings an address in once across rows (a copyless sharing picture is never reused for page pictures). `own` takes Lex's dropped-in copy for a gone / not allowed picture (prepared under its own tidy name, no fetch). Pictures not brought in stay exactly as they are and come back in `left` with their reason.
  - **Agent guard (ticket 13, for slice 75):** `outsidePicturesAllowed("agent")` is false; `by: "agent"` fetches, prepares and saves nothing and returns the pictures as `for-lex`.
- **Commits.** 1ed0425a claim; 627e666d build (GPT-6.1 Sol; runner fixes: agent pictures reported `for-lex`, not "not allowed"; a sharing picture brought in without copies no longer reused by page pictures); a0244642 review 1 fixes; 1229da50 review 2 fix; this close.
- **Tests.** New `tests/outside-pictures.test.ts` (20): naming (countries, no stem, doubled label, escaped/unicode stems, conflicts), https normalisation and one cached read with private options, every gone / not allowed branch, sniffing, SVG, over-20 MiB source read (the limit stays on prepared files), tag-only rewrite with the link kept and outside srcset replaced, `<picture>` unwrap with and without art direction, measured hero eager / lower picture lazy, failed measurement fallback, sharing picture, own copy, read once across rows, cancel / stale / changed repository save nothing, agent guard (no fetch, prepare or import). `tests/editor-csp.test.ts`: exact directive sets for both policies, `https:` only in img-src and connect-src, no `http:`/`*`. New browser spec `tests/native-save/native-outside-pictures.spec.ts`: a real local HTTPS picture server (self-signed via `openssl`, `ignoreHTTPSErrors`) proves Chromium refuses the read without `Access-Control-Allow-Origin` (Playwright's `route.fulfill` bypasses CORS, which the spec also records), open → read, closed → not allowed, unreachable → website gone, 404 → website gone, no policy violation, and an outside `https:` picture loads in the canvas. Ran `npm run check`, `npm run lint`, unit 3,127/3,127; browser outside-pictures + media-policy + canvas 15/15.
- **Review (GPT-6.1 Sol, read-only), 2 rounds.** Evidence: main checkout `.scratch/reviews/mm-71/round-1/`, `round-2/` (run.log: model gpt-6.1-sol, sandbox read-only; result.md `REVIEW_STATUS: complete`). Round 1 fixed 2 (P2): the 20 MiB limit was applied to the incoming picture instead of the prepared files; `<picture>` wrappers were skipped or left with their sources. Round 2 confirmed them, fixed 1 (P2): unmeasured pictures were made lazy with guessed `auto` sizes (now the measure port plus a safe fallback). Rejected 0. Not re-reviewed after round 2: a small, unit-tested fix.
- **Bytes.** `test:budget` 349 KB gzip before first preview paint (budget 355 KB), unchanged from dev: the engine is a lazy chunk; boot code is untouched.
- **Follow-ups.** Slice 74: call `bringInOutsidePictures` per row with `fetch`, a `measure` port from the preview, the shared `brought` map, `own` for drop-ins, and show `left` as **website gone** / **not allowed**; after outside pictures land, re-scan so `sizes`/priority rows settle (slice 72 owns page-wide `fetchpriority`). Slice 75: pass `by: "agent"` or skip `bring-in`, and list the `for-lex` pictures. Slice 73: outside GIFs arrive as GIFs in `media/images/` and are then converted like own GIFs. The browser spec needs `openssl` on the runner (present on GitHub's Ubuntu images).
