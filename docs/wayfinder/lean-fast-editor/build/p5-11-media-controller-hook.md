# Phase 5.11: Media controller host adapter

Base: `1fba7788efef08350c89753ae7cf7ac7a6a0c48b`. Media preparation `d26361eecee778b54b6ecff809d0294cad2614dd` was cherry-picked as `b41a5bf`. Its controller and seven lifecycle tests are unchanged; see `p5-media-controller-prep.md` for the port contract.

Main now supplies the existing media workspace identity, current scope/site/drafts, repository reads, cached sources, stored upload bytes, binary reads, private-master proof and UI actions to `createMediaController`. The controller owns workspace-context policy, image picker orchestration, loaded picker module, gallery session/refresh state, busy observer and disposal. Main loses 85 lines (8,495 to 8,410); no gallery or loaded-module state remains beside the controller.

The existing `loadMedia` recovery gate remains lazy and configures `createMediaWorkspace(mediaController.workspaceContext)` once when the UI module arrives. Gallery-only disposal stays separate from picker closure, preserving tab/mount cleanup behavior. Gallery visibility and selection remain live DOM/tab getters. Existing chooser, gallery ensure/refresh and disposal call sites keep thin bridges. Source, scope and generation identity formats are unchanged.

The original atomic apply block remains in main as `applyMediaBatch(scope, assertLive, batch)`. It retains the editable history-host capture, source/model proof, upload-byte staging and rollback, model eviction, one Undo registration, history-source preparation and refresh behavior through the same `applyMediaWorkspaceBatch`/`mediaDraftTransaction` interfaces. The controller forwards the captured scope and live proof to this host transaction. Upload/Save storage and draft transactions were not moved or duplicated. Repository reads still use the captured controller proof after every asynchronous read; image replacement still retains source/range, private-master, alt-text and post-navigation checks.

## Verification

Node `24.21.0`:

- `npm run check`: passed.
- `npm test`: 1,036 passed, zero failures/skips.
- Seven focused Media controller tests passed, covering context reads and stale I/O, pending gallery disposal, hidden/busy refresh coalescing, picker navigation/source guards and private-master refusal.
- Strict test TypeScript check passed: `tsc --ignoreConfig --noEmit --strict --target ES2022 --lib ES2022,DOM,DOM.Iterable --module ESNext --moduleResolution Bundler --allowImportingTsExtensions --skipLibCheck --types node,vite/client tests/media-controller.test.ts`.
- `npm run build:ui`: passed; existing large-chunk advisory remains.
- `git diff --check`: passed.

Logs: `.scratch/p5-review/media-hook-*.log`. No unit/build run was started during the lead's timing measurement; these checks started after the lead released that restriction. Browser verification belongs to the lead's serial run: `tests/native-save/native-images-tab.spec.ts`, `native-media-library.spec.ts`, `native-image-alt-refusal.spec.ts`, `native-media-pane.spec.ts`, and `native-media-transaction.spec.ts`, plus lazy/smoke/budget coverage. No browser, budget, or Claude review was run by this worker. No push, merge, or deployment was performed.
