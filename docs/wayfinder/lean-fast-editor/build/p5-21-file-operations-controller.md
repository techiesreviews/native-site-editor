# Phase 5.21: File operations controller

Base: `a47abed` (dev), branch `build/p5-file-operations-controller`. Implements slice 14 of `p5-controller-plan.md` with the lead's narrower ownership decision. Main loses 403 lines (8,215 to 7,812).

`src/controllers/file-operations-controller.ts` owns `createFileOperationsController(ports)` and the Files-tab orchestration of `moveFileTarget`, `nativeAssetSnapshot`, `nativeAssetReferences`, `FileMoveUrls`, `planFileMoveUrls`, `nativeMovePins`, `moveFilesWithUrls`, `deleteFileTarget`, `duplicateFileTarget`, and `restoreFileTarget`. Their helpers `protectedProblem`, `moveProblem`, `targetFiles`, `pageLinks`, and the binary-file classification move with them. Main binds the five row actions and retains thin `pageLinks` and `targetFiles` adapters for the Pages controller and native transaction. The adapters are function declarations so earlier controller wiring can reference them without evaluating the later controller instance.

Main keeps `NativeOperation`, `applyNativeOperation`, `withSidecarPages`, `FileOperationRecord`, `applyFileOperation`, `undoFileOperation`, `undoFileChanges`, `releaseFiles`, `resyncNativeSite`, and receipt/history writes. The duplicate draft write is also injected as a host action. Repository traversal (`branchFilesUnder`), repository reads, branch/path validation, sidecar URL edits, redirect reads, route/source/index helpers, tree state and DOM access stay behind ports. `renameFileTarget`, `dropFileTarget`, `renameProblem`, and `dropProblem` remain small host adapters. Discard, `afterFileChanges`, upstream deletion settlement, boot/memory, and the other slices' owned ranges stay in main. Pure planners stay in `src/native-files.ts`, `src/native-page-moves.ts`, `src/file-changes.ts`, and `src/page-builder/asset-references.ts`; this controller calls them rather than copying them.

Ports read live: generation, setup and draft scope, site, engaged state, repository, tree state/signature, current path state, draft store, base/effective/link sources, native files, route and branch state, text-index scope, target draft stamp, confirmation dialog and Files-tab visibility. Actions provide repository reads, index loading, transaction/restore/duplicate writes, sidecar and redirect work, notices/errors, tree rendering, folder expansion, row focus and animation-frame scheduling. No site, source, draft or tree state is cached at controller construction.

Guards keep their original order and proof lifetime. The move keeps the index gate, then its generation capture, branch destination check and target read, followed by the same generation check. URL moves pin the file list, generation, scope and every input source before planning/confirmation; the same pins are checked after confirmation and redirect reading, then combined with asset-reference pins and passed as `expectedSources`/`current` to the host transaction. They are never replaced by a new proof after an await. Asset snapshots retain their file-list/generation/scope proof and source expectations for the host transaction. Delete keeps its generation, scope, index scope, tree signature, effective target source and target draft stamp across index loading, target reading and confirmation, then passes asset source pins into the write. Restore delegates current deleted paths to host Undo and focuses on the next frame. Duplicate preserves target reading, copy-path selection, host draft write, storage-error handling, refresh and focus order.

Only existing runtime modules are imported. Dialog, row-target and draft-store types use type-only imports. No lazy import was added or pulled into the initial graph. A browser check found that passing the native `requestAnimationFrame` function directly as a port changed its receiver and caused `TypeError: Illegal invocation`; main now supplies a callback wrapper, preserving the browser receiver. Import placement alongside the other controller imports keeps the final measured startup smaller than the first extraction build.

## Verification

Node `24.21.0`, selected with:

```sh
export PATH=/home/ubulex/.npm/_npx/387698761821791d/node_modules/node/bin:$PATH
```

- `npm run check`: passed.
- `npm test`: 1,112 passed (1,100 baseline + 12 new), zero failures/skips.
- `tests/file-operations-controller.test.ts` (12): live folder restore, single-file restore, deletion refusing generation/scope/index-scope/draft-stamp/source changes during index loading, source changes during confirmation, unchanged deletion reaching its host transaction once, URL proof expiry during confirmation and redirect reading, asset file-list proof and source expectations.
- Strict test TypeScript check passed: `npx tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --lib ES2022,DOM,DOM.Iterable --types node,vite/client --strict --skipLibCheck tests/file-operations-controller.test.ts`.
- `npm run build:ui && npm run test:budget`: the default build was blocked by `EROFS` writing through the shared `node_modules/.vite-temp` symlink. The budget command after `&&` therefore did not run.
- `npm run build:ui -- --configLoader runner`: passed; existing large-chunk advisory remains.
- `npm run test:budget -- --no-build`: passed, 348 KB gzip before first preview paint, cold median of 3, budget 350 KB. A production build of the untouched base measured 347 KB. Final extraction adds 1 KB; the requested no-growth condition is not met, although the 350 KB gate passes. All three final cold runs measured 348 KB. The first extraction measured 349 KB.
- `git diff --check`: passed.

Browser, port 5236, one worker, always under the shared lock; all ten requested specs exist:

```sh
flock /tmp/ase-5236.lock env ASE_TEST_PORT=5236 npx playwright test --project=native-save --workers=1 tests/native-save/native-file-ops.spec.ts tests/native-save/native-move-host.spec.ts tests/native-save/native-move-keys.spec.ts tests/native-save/native-file-move-race.spec.ts tests/native-save/native-asset-references.spec.ts tests/native-save/native-delete-card-race.spec.ts tests/native-save/native-operation-history.spec.ts tests/native-save/native-store-history.spec.ts tests/native-save/native-page-urls.spec.ts tests/native-save/native-lazy-panels.spec.ts
flock /tmp/ase-5236.lock env ASE_TEST_PORT=5236 npm run test:browser:smoke -- --workers=1
```

- First targeted run: 59 passed, 9 failed (4.0m), all due to the animation-frame receiver error above. These were implementation failures, not flakes.
- Targeted rerun after the fix: 68 passed (3.5m), zero failures/skips.
- Smoke: 32 passed (2.2m), zero failures/skips.
- No full native-save suite was run. None of the listed known flakes failed.

Logs: `.scratch/slice14-unit.log`, `.scratch/slice14-build.log`, `.scratch/slice14-budget.log`, `.scratch/slice14-baseline-build.log`, `.scratch/slice14-baseline-budget.log`, `.scratch/slice14-browser.log`, `.scratch/slice14-browser-fixed.log`, `.scratch/slice14-smoke.log`.

## Remaining constraints

No commits could be created. Both staging and the initial commit attempt failed with `fatal: Unable to create '/home/ubulex/Projects/native-site-editor/.git/worktrees/native-site-editor-p5-file-operations-controller/index.lock': Read-only file system`. The session cannot escalate filesystem permissions. Changes remain unstaged in this worktree; the requested five small branch commits still need to be created once its Git metadata is writable. No push, merge, deploy, agent spawn, or edits under `docs/wayfinder/components-and-builder/` occurred.
