---
title: "Minify the preview runtime at build time"
type: task (AFK)
status: closed
assignee:
blocked_by: []
builder: sol
phase: 7
---

## What

Lex (2026-10-10), after slice 97 (see its Done note): `dev` sits at the 355 KB budget before first paint, so the push check fails. Minify the preview runtime (`src/components/native-preview-runtime.js`, shipped verbatim today) at build time, keeping the source readable in the repo and a source map so it stays debuggable (~24 KB gzip saved). This reverses the lean-fast-editor decision "no minifying" (`docs/wayfinder/lean-fast-editor/build/p5-14-runtime-cache.md`): add a one-line note there pointing here. Update the verbatim-runtime check in `tests/perf/byte-budget.ts` (and any test that reads the runtime's text) to the new rule; keep the runtime's caching (p5-14) working.

## Done when

- `npm run test:budget` passes with clear headroom; the preview works (smoke, the drag and Edit component mode specs); cold timings not worse (scripts/agents/cold.sh); a push to dev passes the "Deploy the dev preview" workflow's budget step (check with `gh run watch`).

## Done (2026-10-10)

- `vite-preview-runtime.ts` (a build-only Vite plugin) minifies the runtime with esbuild at Vite's build target, still a classic-script IIFE, and emits it with an external source map (`sourcesContent` = the readable source) as `/assets/native-preview-runtime-<hash>.js(.map)`; the hash covers the minified code and map, so the immutable caching of p5-14 holds. `vite` dev and the esbuild harnesses still serve the source.
- Runtime 50.7 → 26.3 KB gzip; bytes before first paint 355 → 331 KB (cold.sh, median of 5); cold paint/usable 927/938 → 920/935 ms, warm 352 → 342 ms. `tests/perf/byte-budget.ts` now checks minified + map instead of byte identity.
- Tests: `tests/vite-preview-runtime.test.ts` (classic parse and run, target, map, hash rule); `asset-headers.test.ts` covers the map. Built by Sol.
