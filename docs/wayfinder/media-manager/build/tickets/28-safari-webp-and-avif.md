---
title: WebP in Safari and the AVIF option, loaded on demand
type: task (AFK)
status: closed
assignee: claude (mm-28 runner)
blocked_by: [25-image-recipe]
builder: sol
phase: 2
---

## What

Research [02](../../tickets/02-research-optimising-every-media-kind.md#resolution-2026-10-11) §1–2, ticket [07](../../tickets/07-one-upload-path.md#resolution-2026-10-13).

- Safari cannot make WebP from a canvas and silently returns PNG. Detect that (the blob type) and use a small WebP encoder (about 120 KB, for example jSquash) loaded only when needed.
- **Smallest files (slower)** uses an AVIF encoder (about 1.1 MB) loaded only when chosen; progress shows it is slower.
- Both run in the existing module worker; they must work under the production security policy (`public/_headers`: `worker-src 'self'`, `script-src 'self' 'wasm-unsafe-eval'`), which differs from the test server's.
- Boot bytes unchanged.

## Done when

- `tests/media-encoders.test.ts`: the encoder chosen for a PNG-returning canvas, for AVIF, and the native path otherwise.
- A browser check under the production header that the WASM encoder loads (nightly spec or a scripted check named in the Done section).
- Byte budget: boot delta zero; the encoders are separate chunks.

## Done (2026-10-14)

- **Behaviour.** The image worker's `encode` seam now goes through `createMediaEncoder` in `src/page-builder/media-encoders.ts` (rule: `mediaEncoderFor`).
  - **Safari WebP.** WebP is asked of the canvas first; when the blob comes back as anything but `image/webp` (Safari's silent PNG), the worker encodes the canvas pixels with jSquash's WebP encoder at the same quality, and remembers that for the rest of the worker so copies skip the wasted native try. Other browsers never load it. If the encoder cannot load, the PNG is kept (never-larger rule still applies) with "WebP could not be used in this browser. Used PNG instead."
  - **Smallest files (slower).** Always jSquash's AVIF encoder with the recipe's quality 50 and speed 8, main and copies; transparent pictures still use the Balanced WebP/PNG comparison. If it cannot load or encode, Balanced WebP is used for the main and copies with "Smallest files (slower) could not be used in this browser. Used Balanced WebP instead." Encoder notes now reach the adding summary (`prepareMediaFile`'s warning); an animated PNG/WebP's existing "keep their frames" note shows there too.
  - **Slower progress.** With Smallest files chosen (slice 26's remembered setting), a preparing tile/row reads "Preparing (slower)…" and the summary adds "· Preparing (slower)…". AVIF gets a 5-minute limit instead of 60 s; Cancel works as before; the timeout says "prepare", not "decode".
  - **Loading.** Both encoders load by dynamic `import()` inside the module worker only. `worker.format` is now `es` (vite.config.ts and the test server) so they stay separate chunks; both packages are excluded from dev pre-bundling so their `.wasm` URLs resolve. In dist mode the test server now keeps `public/_headers`' policy instead of overwriting it with the looser test CSP.
- **Chunks (gzip).** WebP: `encode` 0.6 KB + `webp_enc_simd` 7.4 KB JS + 128 KB wasm (non-SIMD 7.4 KB + 115 KB). AVIF: `encode` 0.9 KB + `avif_enc` 7.5 KB JS + 1,128 KB wasm. The multi-threaded AVIF build is emitted but never fetched (needs cross-origin isolation, which the editor lacks).
- **Licences.** `@jsquash/webp` 1.5.0 and `@jsquash/avif` 2.1.1 (pinned) and `wasm-feature-detect` 1.9.0: Apache-2.0. Compiled codecs: libwebp BSD-3-Clause; libavif and libaom BSD-2-Clause (libaom also under the AOMedia royalty-free patent licence). All compatible with the editor's MIT licence; Apache-2.0 asks that the licence travel with redistributed copies (the packages' `LICENSE` files are in `node_modules`).
- **Commits.** 49246e1e claim; c7806fcb build (Sol, plus the runner's Balanced-quality fallback tweak; rebased over slice 26, keeping its quality reading and dropping Sol's duplicate `quality()` hooks, then over slice 40, keeping its trimmed `picture` in the worker and its trim cases in the worker test); d940d5ed review test; then this close.
- **Tests.**
  - New `tests/media-encoders.test.ts`: the rule; a PNG-returning canvas uses the WebP encoder, loaded once and reused for copies, native checked once; AVIF uses its encoder with quality 50/speed 8, loaded once; native WebP/PNG/JPEG never load either; WebP and AVIF load/encode failures with their notes. `tests/media-optimise.test.ts`: the worker run with a failed AVIF encoder gives Balanced WebP main and copies with the note. `tests/media-adding-rules.test.ts`: the "Preparing (slower)…" words. `tests/media-prepare.test.ts`: encoder notes reach the adding warning.
  - **Production-header check:** `scripts/agents/port.sh npm run test:media-encoders-csp` (`tests/perf/media-encoders-csp.ts`; add `-- --no-build` to reuse `dist/`). It builds and serves `dist/` under `public/_headers` and runs the built worker without cross-origin isolation: native WebP fetches no encoder; with `convertToBlob` patched to return PNG for WebP (simulated Safari) the output is real `RIFF…WEBP` from the WebP wasm; AVIF output is real `ftypavif` from the single-threaded wasm, with copies in the same format; zero CSP violations. Passed.
  - Ran: `npm run check`, `npm run lint`, unit 2629/2629 (after the rebase); media specs (adding, library, upload, picker, collections, media tab, media screen, pane) 108/108 before the rebase, then adding/upload/library/picker 37/37 after the slice 26 rebase. After the slice 40 rebase: check, lint, unit 2651/2651; library/adding/upload 31/31; the production-header check passed again.
- **Review (GPT-6.1 Sol), 1 round.** Logs: `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-28/review/` (run.log, result.md). No defects. Validation gaps: worker-level AVIF fallback coverage was removed (fixed: d940d5ed); boot delta lacked evidence (recorded below, plus a check that neither `dist/index.html` nor the boot entry references an encoder). No re-review: the fix was a test only.
- **Bytes.** Same-sitting `test:budget`, origin/dev 7dbb585e vs this branch: 344 → 344 KB gzip before first preview paint (budget 355 KB). Boot entry JS 237,454 → 237,458 B gzip (+4 B, the worker's hashed name); CSS ±0 (20,154 B).
- **Follow-ups.** Real Safari and real-phone AVIF speed stay on Lex's phone list (spec "Safari and phones"). The shared dev `node_modules` needs `npm ci` after this lands so other worktrees see `@jsquash/*`.
