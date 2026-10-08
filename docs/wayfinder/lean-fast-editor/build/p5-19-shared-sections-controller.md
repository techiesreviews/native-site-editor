# Phase 5.19: Shared sections controller

Base: `a47abed` (dev). Branch: `build/p5-shared-sections-controller`.

`src/controllers/shared-sections-controller.ts` exports `createSharedSectionsController(ports)`. It owns the saved-section save controls and save workflow, master/page-part host coordination, active master selection, private editable source and master identity, Edit/Done/Update copies coordination, section choices and insertion, static section previews and thumbnail inputs, insertion snapshots, shared revisions and offered contexts, shared-root actions, submit and disconnect. Main loses 672 lines (8,215 to 7,543).

The API includes `sectionSaveControls`, `insertChoices`, `sharedRoot`, `masterIdentity`, `editableSource`, `submit` and `disconnect`. Small host wrappers retain the existing callback names and call sites. The host creates the existing section-master and page-part controllers with the extracted `masterHost`; the controller reads both through getters. Master banner callbacks delegate to `doneMaster` and `updateMaster`.

Main keeps DOM/editor/preview creation and mounting, the master banner element and its placement/observer, Code pane operations, `applyNativeOperation`, source/file readers, the text index, browser source-location and canonical-copy parsers, class counting, catalog readers, stylesheet parsing and section-template parsing. These stay behind injected operations or readers. Structure Edit and repaint remain host ports so the two slice 12 controllers do not import one another. Both 12a regions at `a47abed` (1585–2333 and 2844–2918) remain byte-identical. Wiring is concentrated around the original master host.

Ports read generation, file generation, setup/draft scope, history view, site, text-index readiness, selection/open-file signals, editor, preview, Code pane and master/page-part controllers live. Captured operation inputs and proofs keep their original lifetime. Only type imports reference UI/editor modules; no lazy UI import was made eager. Pure planning functions were already in the host's eager graph.

Invariants kept: section save pins page model, selection path/node, page/JSON bytes, scope, generation and expected file graph. Master opens preserve revision and session ownership checks before mounting and after the open; master transactions retain the opening page proof, and refused opens restore only their own file generation. Done restores Code collapse only while the automatically revealed pane state is unchanged. Shared rows pin painted source, original model proof, master/session state, shared revision, public/private sources, JSON and graph. Submit retains the offered context, cancellation, selection epoch, graph and in-flight guards; no proof is retaken in place of the offered proof. All multi-file writes still use one `applyNativeOperation`, including a new master plus editor JSON and inserted-copy registration. The success refresh remains a later task so the form closes first.

## Verification

Node `24.21.0`, selected with:

```sh
export PATH=/home/ubulex/.npm/_npx/387698761821791d/node_modules/node/bin:$PATH
```

- `npm run check`: passed.
- `npm test`: 1,119 passed (1,100 + 19 new), zero failures/skips.
- `tests/shared-sections-controller.test.ts` (19): live revision/path classification, one guarded master/JSON operation and deferred refresh, pending generation/scope/history/model/page/stylesheet/graph/open-file/selection/cancel refusal, duplicate-save refusal and retry, unoffered record refusal, same-byte model revision invalidation, master open ownership/revision gates, master transaction graph guard, unavailable roots, live editable public source.
- Strict test TypeScript check: passed (`npx tsc --ignoreConfig --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler --allowImportingTsExtensions --types node,vite/client tests/shared-sections-controller.test.ts`).
- `npm run build:ui`: passed; existing large-chunk advisory remains.
- `npm run test:budget`: 347 KB gzip before first preview paint (cold median of 3), budget 350 KB, within; preview runtime emitted verbatim.
- Initial build/budget attempts hit read-only shared `node_modules/.vite-temp`. Local cache directories with links to the existing dependencies allowed the unchanged commands to pass.
- `git diff --check`: passed.

Browser: all 15 requested files exist; no missing files. Serial, one worker, port 5216, every run under `/tmp/ase-5216.lock`.

- Requested default-fixture run: 9 passed, 63 skipped by existing fixture guards, 0 failed.
- Requested smoke: 32 passed, 0 failed/skipped.
- Supplemental native-static run: 39 passed, 13 actual-fixture skips, 0 failed. It exercises the master/page-part/shared authoring, file lifecycle and link assertions; the known `native-shared-link-host.spec.ts:82` and `native-shared-authoring-host.spec.ts:282` cases both passed.
- Supplemental actual-fixture run: 20 passed, 1 native-fixture skip, 4 failed. The four failures are in `tests/native-save/native-static-section-save-host.spec.ts:204`, `:276`, `:298`, `:318`: Undo is enabled where disabled is expected, and the three Monaco history-refusal notices are absent.
- The four-test rerun failed 4 of 4. A comparison with the unchanged `a47abed` main also failed 4 of 4 with the identical assertions. Both runs used this worktree, fixture, dependencies and port under one lock. Only `src/main.ts` was temporarily replaced by its exact base bytes between completed test runs; the extracted file was restored byte-for-byte afterward. These failures are reproducible base behavior, not classified as flakes. No assertion was changed.
- One initial supplemental native-static attempt included the actual-only save spec and stopped before test execution with `This spec requires the actual starter, received native-static.` The subsequent runs use separate fixture selections.

Requested commands:

```sh
flock /tmp/ase-5216.lock env ASE_TEST_PORT=5216 npx playwright test --project=native-save --workers=1 \
  tests/native-save/native-shared-authoring-host.spec.ts \
  tests/native-save/native-shared-link-host.spec.ts \
  tests/native-save/native-shared-files-lifecycle.spec.ts \
  tests/native-save/native-static-section-save-host.spec.ts \
  tests/native-save/native-static-sections-host.spec.ts \
  tests/native-save/native-section-add-host.spec.ts \
  tests/native-save/native-master-host.spec.ts \
  tests/native-save/native-master-controls.spec.ts \
  tests/native-save/native-master-after-done-proof.spec.ts \
  tests/native-save/native-master-page-part-controls.spec.ts \
  tests/native-save/native-master-assets-host.spec.ts \
  tests/native-save/native-master-code-collapse.spec.ts \
  tests/native-save/native-master-preview-locator.spec.ts \
  tests/native-save/native-master-visual-host.spec.ts \
  tests/native-save/native-lazy-panels.spec.ts
flock /tmp/ase-5216.lock env ASE_TEST_PORT=5216 npm run test:browser:smoke -- --workers=1
```

Supplemental commands (the final four-line selection ran against both the extracted main and the exact base main):

```sh
flock /tmp/ase-5216.lock env ASE_TEST_PORT=5216 STATIC_SECTIONS_FIXTURE=native ASE_NATIVE_SAVE_FIXTURE=.scratch/native-static-preview ASE_NATIVE_STARTER_SOURCE=native-static npx playwright test --project=native-save --workers=1 --grep @native-static \
  tests/native-save/native-shared-authoring-host.spec.ts \
  tests/native-save/native-shared-link-host.spec.ts \
  tests/native-save/native-shared-files-lifecycle.spec.ts \
  tests/native-save/native-static-sections-host.spec.ts \
  tests/native-save/native-master-host.spec.ts \
  tests/native-save/native-master-controls.spec.ts \
  tests/native-save/native-master-after-done-proof.spec.ts \
  tests/native-save/native-master-page-part-controls.spec.ts \
  tests/native-save/native-master-assets-host.spec.ts \
  tests/native-save/native-master-code-collapse.spec.ts \
  tests/native-save/native-master-preview-locator.spec.ts \
  tests/native-save/native-master-visual-host.spec.ts
flock /tmp/ase-5216.lock env ASE_TEST_PORT=5216 ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter npx playwright test --project=native-save --workers=1 --grep @actual tests/native-save/native-static-section-save-host.spec.ts tests/native-save/native-static-sections-host.spec.ts
flock /tmp/ase-5216.lock env ASE_TEST_PORT=5216 ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter npx playwright test --project=native-save --workers=1 \
  tests/native-save/native-static-section-save-host.spec.ts:204 \
  tests/native-save/native-static-section-save-host.spec.ts:276 \
  tests/native-save/native-static-section-save-host.spec.ts:298 \
  tests/native-save/native-static-section-save-host.spec.ts:318
```

The current/base comparison used `flock /tmp/ase-5216.lock env ASE_TEST_PORT=5216 ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter bash /tmp/shared-compare-history.sh`; the temporary helper ran the four-line command, swapped main only after that process exited, ran it against base, then restored the extracted file through an exit trap.

Gate logs are in `.scratch/p5-review/shared-sections-controller/`.

The full native-save suite was not run. Commits are blocked by the sandbox: Git cannot create `/home/ubulex/Projects/native-site-editor/.git/worktrees/native-site-editor-p5-shared-sections-controller/index.lock` (`Read-only file system`). No commits, push, merge or deploy were made. The 12a integration/rebase remains a later branch step.

## Rebase onto dev 30a51e0

The branch was rebased onto dev `30a51e0` (slices 11, 12a, 13, 14, 15) as `eae1ab7`. Conflicts were only in `src/main.ts`:

- Import conflicts were merged, then pruned to what main still uses.
- One block was dropped from both sides: the shared-root code, which this slice moves, and the structure Edit/linked-ancestor code, which 12a moved into the page structure controller.

The page structure controller's `masterRevision`, `nativeMasterSelection`, `masterController`, `pagePartController`, `runMasterEdit` and `nativeSharedCatalogs` ports are live getters. They read main's hoisted wrappers and controller constants. Those wrappers delegate to this controller, and the constants are declared before the page structure controller is created. This slice's eager function ports (`renderNativeEditBar`, `renderNativeShownStructure`, `nativeStructureEdit`) are hoisted wrappers from 12a, so there is no TDZ. A declaration check of main against dev and the original slice found no stale or duplicated names: every name this slice removed is gone, every name it added is present, and nothing else changed. `src/main.ts`: 6,786 lines on dev, 6,108 after.

Gates after the rebase:

- `npm run check`: passed.
- `npm test`: 1,175 passed, 0 failed.
- `git diff --check`: passed.
- Byte budget: 350 KB before first preview paint (limit 355 KB). Dev `30a51e0` measured the same way is 349 KB. `index.js` gzip grows from 281,459 to 282,272 bytes (+813).
- Browser runs used `ase-port.sh`, one worker:
  - Default 16-spec group: 11 passed, 63 skipped, 0 failed.
  - native-static: 40 passed, 13 skipped, 0 failed.
  - Harness projects (native-shared-authoring, native-shared-structure, native-page-part-preview): 22 passed.
  - `@smoke`: 32 passed.
  - actual: 34 passed, 11 failed, 1 skipped. A clean dev `30a51e0` worktree gives 33 passed, 12 failed, 1 skipped with the same 11 failures, plus `native-static-sections-host.spec.ts:29` (desktop). All 11 are pre-existing on dev:
    - `native-card-paths-starter.spec.ts:126`, four themes
    - `native-slot-published-actual.spec.ts:107`
    - `native-static-section-save-host.spec.ts:204`, `:276`, `:298` and `:318`
    - `native-structure-readiness.spec.ts:37`, plus its code-pane-hidden variant
