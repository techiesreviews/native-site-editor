---
title: Split the preview runtime into typed modules under the line limit
status: ready-for-agent
assignee:
blocked_by: [14-file-size-limit]
---

# Split the preview runtime into typed modules under the line limit

## What

Sweep 2026-10-26, item 2. `src/components/native-preview-runtime.js` is 4313 lines (+196 in a week), the
biggest file: one IIFE (line 18), 237 inner functions, three `message` listeners (3547, 3727, 4117). It is
not type-checked (no `@ts-check`, no `allowJs`/`checkJs` in `tsconfig.json`) and only tested through browser
specs and `tests/vite-preview-runtime.test.ts`. It mixes about 13 jobs: DOM reconcile (257-411),
stylesheet sync (438-559), asset sync (127-207, 4002), selection overlays (705-775), Edit component mode
(825-1007), drop targeting (1047-1154), insert points and grids (1395-1673), cascade reading (2152-2438,
mirrored by `src/style-cascade.ts`), text editing and caret (2732-3010), press and drag (3214-3292),
colour inspection (3361-3486), canvas mode (3746-3933), agent presence (4068).

Lex (2026-10-26): split it, and make every file smaller.

## Fix

Move each job into its own typed `.ts` module, bundled into the same IIFE the way
`src/page-builder/rules/*.ts` already are, with the `message` protocol (`apply`/`emit`) as one adapter
module. Share cascade reading with `src/style-cascade.ts` instead of mirroring it. One job per slice is
fine (one PR each); the order follows whichever job the next feature touches. Every new file is under
the 400-line limit of ticket 14; the runtime's allow-list number goes down with each slice and the file
is gone at the end.

## Done when

- `native-preview-runtime.js` no longer exists; its jobs live in typed modules, each under 400 lines.
- The bundled IIFE behaves the same: all native-save and preview specs pass, and the boot byte budget holds.
- Each module with logic that does not need a browser has unit tests.
