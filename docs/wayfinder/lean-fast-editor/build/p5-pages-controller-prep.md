# Pages controller preparation

`src/controllers/pages-controller.ts` owns Pages Rename, Duplicate, Delete,
URL planning/change, move choices, drop refusals, move confirmation and picker
policy. It retains the original messages and plans from main's Pages region.
It reads live site/source/draft/scope/generation/index state through ports;
there is no new cached site or draft state. Main still owns file transactions,
metadata writes, page commits, redirect I/O, UI dialogs and the page picker.
This commit does not hook or change main and does not move its central
multi-file transaction implementation.

## Main adapter

`createPagesController(ports)` returns `retitle`, `duplicate`, `remove`,
`urlPlan`, `changeUrl`, `moveChoices`, `dropProblem`, `confirmMove`, `moveTo`,
`linkSources`, `onBranchHere` and `deleteDraftStamp`. `PagesPorts` is the exact
adapter contract. Supply getters for current state, rather than captured
repository/source values. Supply current-scope drafts only.

Replace the Pages use-case bodies between main's “The Pages tab's Rename,
Duplicate and Delete” and “One undoable operation over several files” headers
with calls to the controller, retaining the existing function signatures for
callers. Keep `readNativeRedirects` on the host: it is shared with other file
operations and guards repository-scoped reads. Keep `withMovedPageUrls` and
`commitNativePage` as host write ports. Do not alter the page-title flush
callback or main's central transaction region.

Shared callers outside the region can keep thin bridges using pure exported
helpers: `pageLinkSources(files, source)`,
`pageOnBranchHere(path, baseFiles, drafts)`, and
`pageDeleteDraftStamp(drafts, path, prefix)`. The controller methods delegate to
these same helpers. Existing draft and source data remain authoritative.

## Captured proof and behavior improvements

The original delete and URL-change expected-source maps remain on host
operations. The controller also passes `operation.current`, protecting the
captured scope/generation/site/index and source proof while the host awaits.
The adapter must forward it unchanged to `applyNativeOperation`.

Move confirmation and picker previously resumed after index/dialog waits
without consistently checking the initiating page. They now refuse navigation,
site/routes/files/source drift or target draft changes. Initial proof excludes
unknown sources so index hydration can succeed. After indexing succeeds, proof
is recaptured for the dialog/picker phase, including newly hydrated sources.
Confirmation also passes its opening source map into the subsequent URL change.
Retitle refresh callbacks refuse generation/scope or target-route drift while
metadata writing waits; a successful metadata write may rebuild site identity. These are explicit stale-action fixes, not just moves.

## Validation

Node 24: `npm run check`, full `npm test` (1017 passed, 0 failed),
`npm run build:ui`, targeted TypeScript checking and `git diff --check` passed. Ten targeted controller tests cover normal movement,
unchanged/occupied refusals, expected-source propagation, late navigation and
source changes, index refusal, redirect-read drift, target draft mutation,
duplicate/retitle behavior, and hydration followed by picker-time drift.
Targeted TypeScript check:

```sh
npx tsc --ignoreConfig --noEmit --strict --target ES2022 --lib ES2022,DOM,DOM.Iterable --module ESNext --moduleResolution Bundler --allowImportingTsExtensions --skipLibCheck --types node,vite/client tests/pages-controller.test.ts
```

The controller is not included in the running application until the separate
main adapter lands. Browser and byte-budget validation belong to that integrated
stack. No browser, deploy, push or remote writes ran for this preparation.


## Retitle host-write correction

Independent correction base: `1fba7788efef08350c89753ae7cf7ac7a6a0c48b`.
The integrated Rename browser case (`native-file-ops.spec.ts:374`) exposed a false refusal after a successful metadata write: the host rebuilds the site object, so comparing raw site identity after `writeMeta` rejected its own legitimate result. Retitle now captures generation, workspace scope and the target file's route, and checks those after the guarded host metadata write. The host's source/model transaction proofs remain unchanged. No main adapter, browser assertion or other controller policy was altered.

Two new tests were red before the fix: same-route site rebuilding returned `The repository changed meanwhile. Try again.` instead of success, and target-route drift was not refused by the old identity check. They now verify legitimate rebuilding succeeds with all three refresh callbacks, while generation, scope, changed-route and missing-route drift refuse without refreshing.

Correction verification on Node `24.21.0`: `npm run check`, full `npm test` (1,031 passed, zero failures/skips), twelve focused Pages tests, strict test TypeScript check, `npm run build:ui`, and `git diff --check` passed. Logs are `.scratch/p5-review/pages-retitle-*.log`, including red and green results. No browser was run by this worker. The Media worktree under browser test remains frozen at `cf9883f`; this fix is supplied separately for integration.
