# Phase 5.18: Page structure controller

Base: `a47abed` (dev). Slice 12a of `p5-controller-plan.md`.

`src/controllers/page-structure-controller.ts` exports `createPageStructureController(ports)`. It owns the edit bar, guarded element changes, whole-section moves (adjacent, after opening the page, and drag to a sibling gap), the queued native text edits and their preparation/source edit, Structure refresh/repaint, Structure's explicit Edit, and linked ancestor lookup. The controller owns the format actions, last edit-bar model, new-link undo group, current section move action, attribute-field session, and text edit queue. Its public aliases include `renderEditBar`, `moveSection`, `moveSectionTo`, `editSharedRoot`, `linkedAncestor`, and `repaint`; original method names support the host's thin wrappers.

Main loses 730 lines (8,215 to 7,485). Wiring stays in one block with live accessors and thin function wrappers; hoisted wrappers preserve early callback registration. Preview keyboard commands and selection clearing read the controller's current format actions, edit-bar model, and move action.

## Host boundary

Main keeps preview/Structure/editor creation and mounting, the last painted Structure and its per-row move proofs, `applyNativeOperation`, source/file readers, draft scope, parsing helpers, media/navigation operations, and the DOM naming helpers `nativeNamedDescendant` and `nativePictureSources`. The latter remain in the host because they parse descendants, alongside the other DOM/source readers. The controller's range, attribute, text-span, wrapper, nearest-link and whole-wrapper readers are injected.

Slice 12b remains in main: saved-section saving, master/page-part hosts, banner and identity workflows, section choices/insertion, master context, `nativeSharedRoot`, shared submission and disconnect. Structure's `nativeSharedRoot` callback stays in its existing host mounting options; the page controller does not import or move it. Calls into shared workflows use ports (`nativeOpenMaster`, `nativeMasterEdit`, `nativeMasterIdentity`, `activeMaster`, `nativeMasterSelection`, the master/page-part controllers and `runMasterEdit`).

Ports read workspace state live through host getters: generation, scope, store/open file/selection, site, sources/effective/editable bytes, editor, preview, draft, version view, current masters/revision, indexed text, files/catalogs, shown Structure and mounted UI collaborators. No workspace state is cached by factory construction. Action-local sources, sessions, revisions and model proofs remain the original pinned snapshots. Pure structure/text/link helpers were already in the static graph; imports from preview, source editor, Structure and shared UI/controller modules used only for contracts are type-only. Lazy media and navigation operations remain behind host ports.

## Guards and history

All 15 moved function bodies match the original after removing port prefixes and whitespace. Existing checks and ordering remain: master session/generation/scope/open file and model proof; exact expected source; move proof generation/scope/node/model/selection/version; page opening's before-mount and post-await checks; text editing's original master session/source and scope guards through waits and file opening; Structure Edit's original proof, painted bytes, selection object, master revision/session, open file and source after awaiting the preview selection. Structure Edit still registers its waiter before requesting selection and never captures a replacement proof after the await.

Element edits remain one `replaceActiveRanges` call. A section swap remains one history step. Queued text edits keep their original order and late page-draft fallback. Multi-file operations remain host-owned, with one `applyNativeOperation` and its existing expected sources/files and all-or-nothing undo history. No test assertions or UX behavior changed.

## Verification

Node `24.21.0`, with:

```sh
export PATH=/home/ubulex/.npm/_npx/387698761821791d/node_modules/node/bin:$PATH
```

- `npm run check`: passed.
- `npm test`: 1,122 passed (1,100 baseline + 22 new), zero failures/skips.
- `tests/page-structure-controller.test.ts` (22): exact replacement bytes/selection, stale source and closed master refusal, adjacent moves and end position, retained generation/scope/source/model/selection/version proofs, Structure wait-before-select ordering and original proof handoff, post-await model/revision/source/open-file/master/selection/painted-source/link/timeout refusal, and live guarded repaint.
- Strict controller-test TypeScript check passed:

```sh
npx tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --lib ES2022,DOM,DOM.Iterable --types node,vite/client --strict --skipLibCheck --allowImportingTsExtensions tests/page-structure-controller.test.ts
```

- `npm run build:ui && npm run test:budget`: passed; 347 KB gzip before first preview paint, cold median of 3, budget 350 KB. The reported value matches the supplied 347 KB baseline. Existing large-chunk advisory remains.
- The first build attempt hit read-only linked `node_modules/.vite-temp`. A temporary local dependency-link layout allowed writable Vite caches; the original `node_modules` link was restored afterward. No dependency or tooling configuration changed.
- `git diff --check`: passed.

All 11 requested spec files exist. Browser gates ran serially, with one worker and port 5216, under the shared lock:

```sh
flock /tmp/ase-5216.lock env ASE_TEST_PORT=5216 npx playwright test --project=native-save --workers=1 tests/native-save/native-page-structure.spec.ts tests/native-save/native-structure.spec.ts tests/native-save/native-structure-compact.spec.ts tests/native-save/native-structure-inplace.spec.ts tests/native-save/native-structure-readiness.spec.ts tests/native-save/native-structure-slots.spec.ts tests/native-save/native-structure-rich-slots.spec.ts tests/native-save/native-structure-slot-actions.spec.ts tests/native-save/native-section-drag.spec.ts tests/native-save/native-component-structure-host.spec.ts tests/native-save/native-lazy-panels.spec.ts
flock /tmp/ase-5216.lock env ASE_TEST_PORT=5216 npm run test:browser:smoke -- --workers=1
```

- Targeted native-save: 116 passed, 2 skipped, zero failures (118 cases, 2.7m). Both skips are existing `@actual` variants at `native-structure-readiness.spec.ts:37` (visible/hidden code pane).
- Smoke: 32 passed, zero failures/skips (2.1m).
- No full native-save run and no failure reruns were needed.

Logs: `.scratch/p5-18/{unit,build,budget,browser,smoke}.log`.

Commit creation is blocked in this environment: Git cannot create `/home/ubulex/Projects/native-site-editor/.git/worktrees/native-site-editor-p5-structure-controller/index.lock` because the worktree metadata is read-only. Changes remain uncommitted on `build/p5-structure-controller`; no push, merge or deployment occurred.
