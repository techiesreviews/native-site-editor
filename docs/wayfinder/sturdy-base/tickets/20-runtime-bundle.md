---
title: "The preview runtime is a bundle in dev, tests and build (canvas gesture rules as its first import)"
type: task (AFK)
status: closed
assignee:
blocked_by: []
builder: claude ★
phase: 2
---

## What

Design: /home/ubulex/Projects/native-site-editor/.scratch/sturdy/frame-protocol-design.md (sections 1, 4.2). Does not need sturdy slice 10.

Today `vite-preview-runtime.ts` only minifies `src/components/native-preview-runtime.js` (esbuild `transform`, `apply: "build"`); Vite dev and the test server (`tests/native-save/server.ts`, `configFile: false`) serve the file as written, so an `import` in it would break the classic script.

- `vite-preview-runtime.ts`: one esbuild `build({ entryPoints: [runtime], bundle: true, format: "iife", write: false })` behind `bundlePreviewRuntime({ minify, sourcemap, target })`. Build: minified, external map, hashed asset under `assets/` as today. Serve (`apply` both, or a second plugin): a middleware answers the runtime's dev URL (`/src/components/native-preview-runtime.js`, what `new URL("./native-preview-runtime.js", import.meta.url)` gives) with the unminified bundle and an inline map, `cache-control: no-cache`, rebuilt when any bundled input changes (esbuild `context` + `rebuild`, or the metafile's inputs' mtimes).
- `tests/native-save/server.ts` adds the plugin to its explicit plugin list (its `distDir`/`preview` mode already serves the build).
- The runtime's "Click and edit rules" block (`canvasGesture`, :2833 to its end marker) moves to `src/page-builder/rules/canvas-gesture.ts`; the runtime imports it. `tests/canvas-gesture.test.ts` imports the module (the regex extraction goes).
- `tests/vite-preview-runtime.test.ts` and `tests/perf/byte-budget.ts` `assertRuntimeMinified`: the map has several sources; check the entry's `sourcesContent` equals the file and the bundle still runs as a classic script (`node:vm`); keep the immutable-name tests.
- Update the comments that say the runtime "is a classic script with no imports" (native-preview.ts:56, canvas-gesture.test.ts, card-grid.ts:12, palette.ts:12, style-cascade.ts:2, shared/cascade.ts:3, worker/site-conventions.ts:6 where it names the file).

## Done when

- Dev (`npm run dev:ui`), the native-save test server and `vite build` all serve a runtime that imports `canvas-gesture.ts`; a unit test bundles the runtime and runs it in `node:vm` without a `SyntaxError`.
- `tests/native-save/native-runtime-recovery.spec.ts` (a 404 runtime) and `native-preview-preload.spec.ts` still pass.
- `npm run test:budget` passes; report the runtime's byte delta.
- `npm run check`, `npm test`, full `native-save` suite green.

## Done (2026-10-10)

- `vite-preview-runtime.ts` bundles the runtime with its imports (esbuild, IIFE, strict): minified with an external map under a hashed `/assets/` name in the build; readable with an inline map from a dev middleware (`no-cache`, rebuilt when a bundled file's mtime changes) in `npm run dev:ui` and `tests/native-save/server.ts`, which adds the plugin. The click and edit rules are `src/page-builder/rules/canvas-gesture.ts`, the runtime's first import.
- Commits 2a783af4, 08532267 (review fixes). Runtime +31 bytes minified (79,673 → 79,704), +43 gzip; budget 332 KB of 355 KB.
- Tests: `vite-preview-runtime.test.ts` rewritten (bundle runs in `node:vm`, dev cache and rebuild, dev middleware), `canvas-gesture.test.ts` imports the module. Unit 1,519/1,519; full native-save 864 passed, 56 skipped; smoke 42/42; @actual 54/54.
