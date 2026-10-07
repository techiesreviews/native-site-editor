# Media controller preparation

`createMediaController` owns captured media workspace reads, image replacement
picker policy, and the explorer Images gallery lifecycle. Its ports read current
workspace identity and source data; it creates no parallel draft/source cache.
Host transactions retain source receipts, model evidence, upload byte staging,
rollback, draft commits and Undo registration.

## Main adapter

The controller returns `workspaceContext`, `chooseImage`, `ensureGallery`,
`requestGalleryRefresh`, `disposeGallery`, `closePicker`, and `galleryVisible`.
`MediaControllerPorts` in `src/controllers/media-controller.ts` is the exact
contract. `workspace()` captures repository full name, draft scope, identity,
optional native site/paths and the existing draft access; `identity()` remains
`${generation}:${setupScope()}`. Supply current values through getters.

Keep the host's lazy media import. Its configuration calls
`createMediaWorkspace(controller.workspaceContext)` once as before. Pass that
existing lazy loader to `load`; the controller only remembers the loaded module
for closing the picker. Do not statically import media-picker UI or its CSS.

Move the policy/read portion of `mediaWorkspaceContext` and
`chooseMediaForImage` into thin controller bridges. Keep the original
`applyMediaWorkspaceBatch(mediaDraftTransaction(...))` body on the host through
`applyBatch(scope, assertLive, batch)`. Keep `applyNativeChange`, source cache
writes, repository I/O and uploaded-byte reads as host ports. Do not move
multi-file transactions or upload/Save reconciliation.

Replace explorer gallery state, ensure/dispose/refresh functions with controller
bridges. Keep tab DOM/key handling in main. `disposeGallery` disposes only the
gallery; `closePicker` is separate, matching the original deactivation order.
`gallerySignature` retains the original generation/workspace/commit/drafts proof.
Optional `locateElement` and `observeBusy` provide test seams; production can
omit both and use the existing DOM locator and MutationObserver.

## Evidence and guards

Workspace reads check captured identity after every awaited entry/text/blob read
before adopting into the host source cache. Asset versions come directly from
captured-scope draft records or branch SHAs; atomic batch validation remains in
the original transaction host. The picker retains the exact original source,
image tag, alt, master session/model proof and generation across lazy loading,
selection and restore waits.

Gallery refreshes wait while hidden or busy and coalesce after readiness.
Disposal now invalidates a pending lazy gallery opening even when workspace
identity remains the same, preventing a detached gallery from remounting after
session/UI cleanup. This explicit lifecycle guard is the only intended behavior
improvement over the extracted gallery implementation.

## Validation

Seven targeted tests cover existing alt/source replacement, lazy-load navigation,
restore-time source drift, private-master model drift, stale source cache reads,
asset/upload scope evidence, pending-open disposal, and hidden/busy refresh with
separate picker closing. Targeted test TypeScript check:

```sh
npx tsc --ignoreConfig --noEmit --strict --target ES2022 --lib ES2022,DOM,DOM.Iterable --module ESNext --moduleResolution Bundler --allowImportingTsExtensions --skipLibCheck --types node,vite/client tests/media-controller.test.ts
```

Node 24: `npm run check`, full `npm test` (1036 passed, 0 failed),
`npm run build:ui`, seven targeted tests, targeted test TypeScript checking and
`git diff --check` passed. Main remains unchanged in this preparation; integrated browser,
media transaction and byte-budget checks belong to the separate main adapter.
No browser, push, deployment or external writes ran.
