# Phase 5.7: History panel controller

Base: `f625d107f1eef3f95c38a9e6eac4b042eb5ccac1`.

`src/controllers/history-controller.ts` owns the lazy History UI instance, latest opening epoch, same-target loading promise, selected file/site tab, panel positioning, close/destroy, resize listener, and captured request context. Its public API is `open`, `position`, `close`, `destroy`, `mark`, and `refresh`. Main loses 40 lines (8,837 to 8,797).

The host captures account, repository ID/name, branch, file, generation, empty-snapshot state, draft lookup and current version marker. The controller checks the captured proof plus panel/anchor identity after module loading and before request callbacks. The mount waits for the original open file even when opening Whole site; mounted Whole site history retains its existing ability to navigate among files within the same repository/branch. The host retains `openFileVersion`, `viewVersion`, `endVersionView`, `afterRestore`, and the complete version-view compare/restore transactions and source/time guards. No restore-validation logic was moved or rewritten.

The existing lazy loader and recovery gate remain in main and run only on History opening. Empty snapshots display the original no-commits message without constructing request UI. Positioning retains the original viewport clamps. Same-target repeated opening while loading shares one promise; explicit subsequent clicks still toggle the mounted popover. Scope changes force a new instance. Old instances' action callbacks are refused after superseding requests, navigation, or destruction. Destruction invalidates pending work, closes the popover, destroys request UI and releases the controller's resize listener; an old pending finalizer cannot clear a replacement load. Login teardown and successful restore use this same destruction path.

## Verification

Node `24.21.0`:

- `npm run check`: passed.
- `npm test`: 1,003 passed, zero failures/skips.
- Six focused controller tests passed: same-target mount deduplication and viewport placement, resize cleanup, late load refusal with restart, navigation during loading, empty-repository message, stale request actions, and tab-switch replacement.
- Test TypeScript check passed: `tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --allowImportingTsExtensions --skipLibCheck --types node,vite/client tests/history-controller.test.ts`.
- `npm run build:ui`: passed; existing large-chunk advisory remains.
- `git diff --check`: passed.

Logs: `.scratch/p5-review/history-*.log`. Browser and budget runs are reserved for the lead's serial verification: `tests/native-save/native-history.spec.ts`, `native-history-action.spec.ts`, `native-store-history.spec.ts`, and `native-lazy-panels.spec.ts`, then smoke/budget as applicable. This branch claims no browser or budget result. No Claude review, push, merge, or deployment was performed.
