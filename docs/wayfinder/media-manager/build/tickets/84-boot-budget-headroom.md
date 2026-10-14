---
title: Win back boot budget headroom
type: task (AFK)
status: open
assignee: claude (mm-84 runner)
blocked_by: [49-media-tab-badge]
builder: sol
phase: 1
---

## What

After media phases 0 and 1 the editor's boot bundle measures about 349 KB gzip of the 355 KB budget (`npm run test:budget`, enforced in CI), while stage 2 (adding and preparation) and later stages still need small boot hooks.

Win back headroom with **no behaviour change**: move code that first paint does not need out of the boot bundle into lazily loaded chunks (dynamic `import()`). Candidates: media, agent, collections and usage helpers that slipped into boot; rarely used dialogs; settings panes. Find the biggest boot contributors from the build output (chunk contents, source maps); add no dependencies.

Parallel slices 14 (file details), 17 (drop to add) and 52 (rename engine) touch the media chunk: keep churn in their files to the minimum the move needs.

## Done when

- `npm run test:budget` measures boot at **343 KB or less** (before and after reported precisely, in bytes).
- Nothing the user sees or does changes: `npm run check`, unit tests, `npm run lint` and the full native-save suite (`scripts/agents/full-suite.sh 3`) pass, failures matched against `tests/known-failures.json`.
- No new dependencies; every moved module loads on the action that needs it, and what first paint still needs stays in boot.
