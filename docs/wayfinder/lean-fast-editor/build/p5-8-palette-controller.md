# Phase 5.8: command palette controller

Base: `c5af463ae40f68e31c42e76deaf35556c0d10ff7`.

`src/controllers/command-palette-controller.ts` owns keyboard-layer mounting/disposal and derives pages, components, files, source, current file, selection, editing availability, and the text-index readiness gate from live workspace ports. Its public API is `mount` and `dispose`. Main loses 22 lines (8,797 to 8,775). The host provides app-store signal references, site/source/control getters and high-level domain actions; draft edits remain in the existing host transactions.

Page labels retain the existing page-title/heading rules, including the Home label. Component labels and section eligibility use the same source helpers. Selection is exposed only when it belongs to the current file. There is no copied repository, text or selection state. The text index is requested only when the palette's existing readiness callback runs with a site whose text is not indexed.

The controller reuses `EditorPaletteDeps` and `mountEditorPalette`. The keyboard registration layer remains available at workspace mounting, while command UI and the shortcuts sheet retain their existing dynamic imports inside `page-builder/palette.ts`. That module's initial Cmd+P query handoff, pending-key capture, Escape cancellation, source/model/revision command guards and chunk recovery were not changed. Controller mount epochs refuse old dependency actions/views after disposal. The public workspace revision stays exactly equal to the host edit-bar origin revision; it is not extended with the controller mount epoch.

New page orchestration now lives in the controller: open Pages, wait for its toggle render, then start the title field. It rechecks controller lifetime and workspace revision after the wait, preventing a late command from starting an input in another workspace. Disposal clears these short timers and resolves their waits so suspended commands terminate. The actual explorer and page-tree operations remain host actions.

## Verification

Node `24.21.0`:

- `npm run check`: passed.
- `npm test`: 1,007 passed, zero failures/skips.
- Four focused controller tests passed: titles/headings and section derivation with lazy indexing, live signal selection/editability, remount disposal and stale dependencies, and new-page deferred rendering across navigation/disposal.
- Test TypeScript check passed: `tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --allowImportingTsExtensions --skipLibCheck --types node,vite/client tests/command-palette-controller.test.ts`.
- `npm run build:ui`: passed; existing large-chunk advisory remains.
- `git diff --check`: passed.

The first focused test expected a heading for the root page; the existing helper intentionally labels it Home. The fixture was corrected and given a separate non-root heading case, without changing product labeling. Logs: `.scratch/p5-review/palette-*.log`.

No browser or budget run was started. Serial browser verification belongs to the lead: `tests/native-save/native-palette.spec.ts`, `native-palette-elements.spec.ts`, `native-panel-collapse.spec.ts`, and `native-lazy-panels.spec.ts`, plus smoke/budget as applicable. This slice claims no browser, budget, or Claude-review result. No push, merge, or deployment was performed.


## Captured revision contract correction

The original extraction appended a palette epoch to the host revision. This broke `palette.ts`'s exact comparison with captured edit-bar `origin.revision`, causing selection commands to refuse a valid current model. The fix returns the unchanged host revision while retaining separate lifetime guards for stale actions and views. A new captured-model test was red (`workspace-1:palette:1` versus `workspace-1`) before the fix and passes afterward; remount refusal remains covered. Root identified three browser failures before palette actions (Heading remained selected after the guarded Select parent shortcut); the browser reproduction and rerun belong to root. This correction does not modify host identity, palette UI, or assertions.

Correction checks: `npm run check`, full unit tests (1,008 passed), five focused controller tests, targeted test TypeScript check, `npm run build:ui`, and `git diff --check` passed. Logs are `.scratch/p5-review/palette-revision-*.log`. No browser was run by this worker.
