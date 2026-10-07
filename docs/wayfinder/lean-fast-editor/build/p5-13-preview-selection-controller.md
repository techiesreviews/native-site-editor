# Phase 5.13: Preview selection controller

Base: `41bd527` (dev).

`src/controllers/preview-selection-controller.ts` owns preview selection dispatch: `select` (was `selectNativeSource`), `refuse` (was `refuseNativeSelection`), the element mark (was `markNativeElement`), the pending click and its `replayPending(path)` (called by `mountSource`), the pending instance snapshot, the source intent (`recordIntent`, `editableTemplatePath`), the selection counter (`selectionEpoch()`) and waiters (`waitFor(path, node, ms)`, used by Structure's Edit), the bound text selection (`textSelection()`), and the grid-report, text-selection and select handlers spread into `createNativePreview` through `handlers()`. Main keeps thin `recordNativeSourceIntent` and `nativeEditableTemplatePath` wrappers for their call sites. Main loses 107 lines (8,269 to 8,162).

Ports, read live: `generation` (read only), `scope`, `store` (selection, openFile, snapshot), `site`, `sources`, `effectiveSource`, `editableSource`, `masterEdit`, `preview` (route, selectNode, clearSelection, hideEditBar), `editor` (isMounted, markElement), `componentTag`, `editingScopePath`, `instanceContent`, `locateTag` and `tagName` (DOM parsing stays in the host), `openFile(path, epoch)` (restoreFile without the default linked style), `renderEditBar`, `linkStyles`, `clearMoveAction`, `structureSelect`, `hideComponentTools`, `agentContext`, `announce`, `setTimer`/`clearTimer`, and the style counters `beginReveal()` (bumps the linked-style, file and secondary requests, returns the linked-style request), `styleRequest()` and `clearStyles()`.

Invariants kept: refusal order (master session gate, instance snapshot, painted source); a refusal clears pending click, pending instance, move action, selection, mark, preview selection, Structure and component tools, and a refresh refusal is not announced. An instance redirect stores its snapshot and calls `selectNode` without changing the selection. The counter moves only when path or node changes; waiters run after `store.selection` is written, and `waitFor` registers before the host calls `selectNode`. Reveal order: clear the open file's mark, set the pending click, `beginReveal`, open the file; after the await the style request, generation and open file are re-checked before mark, edit bar and styles. Replay clears the pending click first, replays only in the same generation and stays ahead of `mountSource`'s file-generation guard. Only type imports from `native-preview`; `nativeComponentScopeSelection` and `nativeSitePaths` were already in main's graph.

One fix found in review of the move: the grid-report key used to be local to each `mountWorkspace` call; `handlers()` now resets it so each preview starts without a stale key.

## Verification

Node `24.21.0`:

- `npm run check`: passed.
- `npm test`: 1,084 passed (1,067 + 17 new), zero failures/skips.
- `tests/preview-selection-controller.test.ts` (17): master gates (two messages), master's own copy allowed, painted-source refusal and silent refresh refusal, instance redirect then unchanged/changed snapshot and generation bump, unmapped instance, refresh with file open vs not, reveal order, reveal with style request or generation bumped during the open, clear selection, replay same vs stale generation, source intent expiry/fallback, page click clears intent, `waitFor` match and timeout, counter, text/grid report dedupe.
- Strict test TypeScript check passed.
- `npm run build:ui`: passed; existing large-chunk advisory remains.
- `ASE_BUDGET_PORT=5594 npm run test:budget -- --no-build`: 345 KB gzip before first preview paint (budget 350 KB), within.
- `git diff --check`: passed.

Browser (port 5216, one worker; logs `.scratch/p5-review/preview-selection-*.log`):

- Selection-focused native-save specs (20 files): 152 passed.
- `@smoke`: 32 passed.
- native-static: first run 39 passed, 1 failed, 13 skipped (`native-shared-link-host.spec.ts:82`, bar showed the section instead of "No image"); the spec alone passed 3 of 3, and two later full group runs gave 40 passed, 13 skipped, 0 failed. Treated as a flake.
- Full native-save: 708 passed, 85 skipped, 0 failed.
