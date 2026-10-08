# P5-23: dead code in main.ts (slice 17)

`src/main.ts`: 6,220 lines before, 6,205 after. No behaviour change.

## Deleted

Found with `tsc --noEmit --noUnusedLocals`, then confirmed by grepping `src/` and `tests/` (including strings and test hooks) for each name.

- Unused imports: `routeHeading`, `createGetStarted`, `createStartSite` (type), `editNativeRedirects`, `groupRouteChanges`, `isRouteWithin`, `rewriteRouteLinks`, `RouteChange`, `buildNativePagesTree`, `nativeNewTarget`, `NativeNewTarget`, `decodeHtmlEntities`, `isFolderRoute`, `nativeRouteFile`, `resolveNativeSectionLinks`, `resolvePagePartLinks`, `nativePageUrl`, `nativePageWithDetail`. The two whole statements removed (`html-entities`, `native-section-links`) are pure modules that other modules import anyway, so no side effect is lost. `native-page-moves` is now a type-only import; it is also loaded by `native-pages`, `pages-controller` and `pages-tree`.
- Uncalled functions: `showCodeChanges`, and the wrappers `isStaticSectionTag` (forwarding to `sharedSections`) and `nativeLinkedAncestor` (forwarding to `pageStructureController`). The controllers still use and export their own functions.

## Kept, and why

- `nativeSitePageChoices`, `nativeFallbackPage`, `nativeComponentTagForPath`, `showUpload`: not dead. Each has live callers (settings and navigation panels, the `fallback` port and page deletion, component styles, opening uploaded drafts).
- `planNativeNew`, `nativePageLabelOf`, `createNativeNew`: passed as ports (`pagesTree` `create`, edit-bar and page-structure `pageLabel`) in code that runs before `const pagesController` (line ~3540) is initialised, or in object literals built before it. The hoisted wrapper is what avoids the TDZ; inlining would change evaluation time.
- `renderPagesTree`, `moveProblem`, `targetFiles`, `pageLinks`: they sit in the file-tree ranges another branch is moving (~3263-3445, ~4130-4233). Left untouched.
- The remaining `sharedSections`/controller forwarders are still called; inlining them is left to the controller slices.

## Gates

- `npm run check`: pass.
- `npm test`: 1,182 / 1,182 pass.
- `npm run build:ui && npm run test:budget -- --no-build`: 351 KB gzip, budget 355 KB, same as before (the bundler already dropped the unused imports).
- `ase-port.sh npm run test:browser:smoke -- --workers=1`: 32 passed.
- `ase-port.sh npx playwright test --project=native-save --workers=1 native-file-ops native-page-urls native-page-title-refresh native-create native-cards native-structure native-edit-bar native-lazy-panels native-shared`: 178 passed, 30 skipped (skips are in the specs), 0 failed.
