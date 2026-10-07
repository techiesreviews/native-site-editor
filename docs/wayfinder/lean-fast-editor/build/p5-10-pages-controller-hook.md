# Phase 5.10: Pages controller host adapter

Base: `aa9ad844264a9e081173caa83ccbc28d561b9a10`. Pages preparation `83c8494aac8fa1af6b87e973b8bfba89894dc335` was cherry-picked as `c1c2531`; the independent palette revision correction `de8c74d14d9817cc21ea6086d1f3f1172ebcd4b7` was then cherry-picked as `05b90b7`. The controller and its ten tests are unchanged from preparation. See `p5-pages-controller-prep.md` for its API, policy and captured-proof details.

Main now supplies live Pages ports and delegates Rename, Duplicate, Delete, URL planning/change, move/drop refusal, move confirmation and Move to. Existing function signatures remain as small bridges for page-tree, page-structure, version and component callers. The extracted policy removes 280 lines from main (8,775 to 8,495), while shared file operations use the same pure `pageLinkSources`, `pageOnBranchHere`, and `pageDeleteDraftStamp` helpers with the current draft scope.

Main retains redirect file I/O, moved-page canonical/og:url edits, metadata writing, page commits and the central `applyNativeOperation` transaction. The operation adapter forwards the full original object, including `expectedSources` and `current`, without filtering proof fields. No multi-file apply, history receipt, save, restore, draft source or title-flush transaction was moved. Ports reference current site/generation/scope/index/files/sources/drafts; no second cached truth is introduced.

The preparation's additional guards are now active: stale target navigation or edits during move picker/confirmation are refused, including sources hydrated by indexing; delete and URL operations carry their captured current proof through host awaits. Original expected-source maps and host source/time guards remain authoritative. The existing page title interaction-end refresh stays unchanged.

## Verification

Node `24.21.0`:

- `npm run check`: passed.
- `npm test`: 1,029 passed, zero failures/skips, on the final stack including the palette revision correction.
- Ten focused Pages controller tests passed, including movement success/refusal, expected-source proof propagation, navigation/source drift during waits, target draft mutation, duplicate/retitle, and hydration followed by picker drift.
- Strict test TypeScript check passed: `tsc --ignoreConfig --noEmit --strict --target ES2022 --lib ES2022,DOM,DOM.Iterable --module ESNext --moduleResolution Bundler --allowImportingTsExtensions --skipLibCheck --types node,vite/client tests/pages-controller.test.ts`.
- `npm run build:ui`: passed; existing large-chunk advisory remains.
- `git diff --check`: passed.

Logs: `.scratch/p5-review/pages-hook-*.log`. Browser verification belongs to the lead's serial run: `tests/native-save/native-page-urls.spec.ts`, `native-file-ops.spec.ts`, `native-file-move-race.spec.ts`, `native-page-title-refresh.spec.ts`, and `native-cards.spec.ts`, with applicable move and smoke/budget coverage. No browser, budget, or Claude review was run by this worker. No push, merge, or deployment was performed.
