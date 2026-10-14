---
title: Split the library view - busy lock, byte cache, refresh, filter
type: task (AFK)
status: in-progress
assignee: claude (mm-03 runner)
blocked_by: [02-remove-legacy-workspace-members]
builder: sol
phase: 0
---

## What

First half of splitting `src/page-builder/media-library-view.ts` (492 lines, one closure `:29-485`) on research 04's seams (`git show 2d97d703:docs/wayfinder/media-manager/research/04-media-code-today.md`, section 3). Behaviour stays the same; the new Media screen (phase 1) reuses these parts.

- **Busy lock** (seam 2): `task`, `setBusyControls`, the capture-phase click and key blockers, as a small module any manager panel can use.
- **Byte cache** (seam 3): `asset()` decodes a blob once per version and keeps the object URL; release on refresh.
- **Refresh and focus keeping** (seam 4): reload, drop stale cached bytes by `version`, keep an unfinished metadata form and its focus. The most intricate part; keep it pinned by the existing e2e specs.
- **Filter and sort** (seam 5): a pure function with its own unit tests.
- Module names are the builder's choice (for example `media-busy-lock.ts`, `media-byte-cache.ts`, `media-library-refresh.ts`, `media-library-filter.ts`).

## Done when

- New unit tests: `tests/media-library-filter.test.ts` (search, kind, sort order, empty results) and `tests/media-byte-cache.test.ts` (one decode per version, URL revoked on a new version).
- `native-images-tab.spec.ts`, `native-media-library.spec.ts` and `native-media-pane.spec.ts` pass unchanged; full suite green.
- The view file loses these parts and imports them; byte-budget delta reported.
