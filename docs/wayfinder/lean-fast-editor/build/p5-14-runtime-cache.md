# Phase 5.14: Preview runtime under a hashed, immutable URL

Base: `59e40ec` (dev).

## What changed

- `public/native-preview-runtime.js` moved (unchanged, `git mv`) to `src/components/native-preview-runtime.js`.
- `src/components/native-preview.ts` builds the frame's script URL with `new URL("./native-preview-runtime.js", import.meta.url).href` and puts that absolute URL in the srcdoc `<script src defer>`.
- Vite emits the file as a plain asset, byte-for-byte (`cmp` against the source: identical; no bundling, no minifying, still a classic script), at `dist/assets/native-preview-runtime-<hash>.js`. The index chunk refers to it. The existing `/assets/*` rule in `public/_headers` (`public, max-age=31536000, immutable`) now covers it.
- In `vite` dev the URL is `/src/components/native-preview-runtime.js`. The esbuild harnesses for the page-part and master preview resolve it against `/harness.js` to `/native-preview-runtime.js`, which their servers already serve (only the file path they read changed).
- `/native-preview-runtime.js` is no longer served. Nothing outside the editor uses it: published sites, the starter and MCP never load it, the worker and CSP have nothing keyed to it, and `run_worker_first` covers only `/api/*`, `/auth/*`, `/mcp` and `/.well-known/*`. A tab opened before a deploy that first opens a site after it asks for the previous hashed runtime, which is gone (plain 404). The failed `<script>` inside the sandboxed frame never reaches the editor, so chunk recovery would not see it and the preview would stay blank. The host therefore runs a `ready` watchdog: once the frame is attached, if no `ready` arrives within 8 s (`RUNTIME_READY_TIMEOUT_MS`), it calls `handleChunkLoadFailure`. With the preview frame mounted, `hasEditableRecoveryState` treats the opaque sandboxed frame as possible unsaved state, so recovery shows the "An editor update could not load" notice rather than reloading. `tests/native-save/native-runtime-recovery.spec.ts` returns 404 for the runtime and expects that notice. Frames that loaded before the deploy are unaffected, because the frame is never re-created. A future parked (hidden) frame stays covered while attached; the watchdog fires only when `frame.isConnected`.
- Tests: `native-canvas-avoid.spec.ts` reads the frame's actual script URL rather than a fixed path, and matches stack frames by that file name. `native-preview.spec.ts` accepts the hashed name. `asset-headers.test.ts` checks that a hashed runtime is immutable; the old path is gone from its negative list.
- `tests/perf/byte-budget.ts` asserts that `dist/assets/native-preview-runtime-<hash>.js` is byte-identical to the source before measuring, so a Vite change that bundles or transforms it fails the budget step.
- Comments and current docs now point at the new path. Historical deployment notes in `docs/NATIVE-PROJECT.md` are unchanged.

## Why it is safe

Same bytes, same classic `defer` script, still same-origin `'self'` under the CSP. The srcdoc frame gets an absolute URL, so it needs no base URL.

## Measurements

`tests/perf/cold-start.ts`, dist served by `tests/native-save/server.ts`, `ASE_COLD_NET=100/20`, median of 5:

| | cold paint | cold usable | warm paint | warm usable | warm bytes before paint |
| --- | --- | --- | --- | --- | --- |
| before (59e40ec) | 1199 | 1200 | 779 | 779 | 11 KB |
| after | 1210 | 1224 | 671 | 671 | 10 KB |

Warm paint is about 108 ms faster: the runtime is now a cache hit with no revalidation round trip. Cold is the same within noise.

Byte budget (`test:budget --no-build`): 346 KB gzip before first preview paint, before and after (budget 350 KB). The runtime is still counted (39 KB, now listed as `/assets/native-preview-runtime.js`).

## Verification

Node 24:

- `npm run check`: passed. `npm test`: 1,092 passed, 0 failed.
- `npm run build:ui`: passed, with `dist/assets/native-preview-runtime-C68U6PUY.js`.
- Browser on port 5216, one worker: smoke 32 passed; lazy-panels, boot-requests and canvas-avoid 11 passed; native-preview 17 passed; page-part and master preview 9 passed; native-static 40 passed, 13 skipped, 0 failed.
- Full native-save: 719 passed, 85 skipped, 1 failed. The failure was `native-canvas.spec.ts:195` (hover hint not visible). The spec then passed 3 times in a row (39 of 39), so it is treated as a flake.
