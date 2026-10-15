---
title: Trim the boot bundle again
type: task (AFK)
status: in-progress
assignee: claude (mm-102 runner)
blocked_by: [78-prefix-every-writer]
builder: sol
phase: 7
---

## What

After slice 78 (951fb9bf) the editor's boot bundle measures about 353.6 KB gzip of the 355 KB budget (`npm run test:budget`, enforced in CI), while slices 79 (Change URL and redirects), 80 (change site address) and 81 (GitHub Pages and rules) still need room.

Win back at least ~8 KB gzip with **no behaviour change**: move boot code that first paint and first interaction do not need into lazily loaded chunks (dynamic `import()`, through the shared `lazyModule`), the way slice 84 did. Candidates: media-manager code that only runs after the user opens Media, a popup, Site settings, Improve images or Clean up; the `html-entities` table; `refusal-note.ts`, `publish-menu.ts`/`repository-menu.ts` bodies; the site-path-prefix helpers only if first paint does not need them. Add no dependencies.

Slice 79 runs in parallel and edits Change URL / redirects code: keep churn in those files to the minimum the move needs.

## Done when

- `npm run test:budget` measures boot at least ~8 KB gzip lower than before (before and after reported precisely, in bytes).
- Nothing the user sees or does changes: first paint and first interaction never wait on a new network request for something shown immediately (prefetch the chunk on idle where needed). `npm run check`, unit tests, `npm run lint`, the touched browser specs and the full native-save suite (`scripts/agents/full-suite.sh 3`) pass, failures matched against `tests/known-failures.json`.
- No new dependencies; every moved module loads on the action that needs it.
