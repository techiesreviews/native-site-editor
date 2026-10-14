---
title: Split the library view - busy lock, byte cache, refresh, filter
type: task (AFK)
status: closed
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

## Done (2026-10-14)

- **Behaviour.** `media-library-view.ts` (487 → 401 lines) now imports four modules in `src/page-builder/`, all in the lazy media chunk: `media-busy-lock.ts` (`createBusyLock`: `task`, `cancellation`, busy controls, the capture-phase click and key blockers; any manager panel can use it), `media-byte-cache.ts` (`createMediaByteCache`: one load and decode per path and version, `sync` drops stale versions on refresh, injectable URL and decode hooks for tests), `media-library-refresh.ts` (detail and metadata identity, folder rebuild, selection pruning, delete teardown during refresh, metadata-form and focus capture/restore; the refresh sequence and its awaits stay in the view) and `media-library-filter.ts` (pure `filterMediaLibrary`, `mediaLibraryTags`, `accepts`, `parent`, `basename`). One intended change, as the ticket asked: a dropped cache entry (new version on refresh, a failed load, a clear after rename or import) now revokes its object URL once its load settles; before, stale URLs stayed until the view closed. Optimise previews still live until the view closes. Nothing visible changes.
- **Commits.** f146377b claim; 119d1f45 split (built by Sol); close.
- **Tests.** New `tests/media-library-filter.test.ts` (search across path, alt, tags and usage alts; accept by extension, wildcard and MIME; folders; tags; sort orders and tie-breaks; empty results) and `tests/media-byte-cache.test.ts` (one decode per version, reload and revoke on a new version, clear, pending and rejected drops, shared URLs, dispose, closed view). `npm run check`, `npm run lint`, unit 2338/2338; `native-images-tab`, `native-media-library`, `native-media-pane` unchanged, 40/40. Full suite (3 shards): 889 passed, 1 failed, 60 skipped. The failure, `native-media-policy.spec.ts` (blob MP4 `currentTime` must advance), also failed one rerun under load, then passed on the untouched base and 3/3 on this branch with the machine idle; it never opens the library, so it is timing-sensitive under parallel load, not caused by this slice.
- **Review (GPT-6.1 Sol, read-only).** No defects on spec or standards. One validation gap (byte delta not recorded) answered below. Nothing rejected.
- **Bytes.** Boot 341 KB gzip of 355 KB before and after. Build: lazy media chunk 8,529 → 9,063 B gzip (+534 B); entry +9 B gzip (changed chunk reference only).
- **Follow-ups.** Slice 56's `native-media-policy` spec can fail under heavy parallel load (video playback timing); its owner may want a longer poll. Ticket 04 takes the rest of the view (shell, cards, detail sheet, delete, Optimise, input wiring).
