# Phase 5.16: Pages tree and new-page creation

Base: `a47abed` (dev). Slice 11 of `p5-controller-plan.md`.

`src/controllers/pages-controller.ts` (from 5.10) now also owns the explorer tab state (`explorerTab()`, `selectTab`, `updateTabs(reset)`), the Pages tree render (`renderTree(focus)`), new-page planning (`planNew(request, create)`), the home template (`homeTemplate()`), the page address (`address(route)`) and label (`pageLabel(file)`), and creation (`createNew(request)`, `createFolderPage(route)`). Rename, Duplicate, Delete, URL and move were already there; Retitle and Duplicate now use the controller's own tree render, address and label instead of host ports. `ExplorerTab`, `explorerTabNames`, `NATIVE_HOME_UNREAD` and `NativeNewPlan` are exported from the controller. Main keeps one-line wrappers (`selectExplorerTab`, `updateExplorerTabs`, `renderPagesTree`, `planNativeNew`, `nativeHomeTemplate`, `nativePageLabelOf`, `createNativeNew`, `createNativeFolderPage`) for its many call sites. Main loses 120 lines (8,215 to 8,095).

New ports, read live: `tree()` (the mounted `createPagesTree` view, or none), `pagesHidden()`, `openFile()`, `clearPendingTitles()`, `tabsMounted()`, `paintTabs(tab, native)` (the tab/panel DOM loop), `resetExplorer()` (tree reset and gallery dispose without a native site), `showImages()`, `siteUrl()`, `siteReadForCreate()`, `createWithCard(request)` (undefined without card grids), `navigationTarget(path)` and `restoreDeleted(file)`. `PagesOperation` gained `creates` and `open`. Removed ports: `pageLabel`, `address`, `refreshPages`.

Stayed in main, and why:

- DOM mount: `createPagesTree`, its event wiring, `mountExplorerTabs` (click/keyboard), the explorer toggle listener and the tab painting. `createPagesTree` is already in the initial chunk; moving the mount would only add DOM ports.
- `nativeSiteReadForCreate` with its generation/scope await guard, `commitNativePage`, `withMovedPageUrls`, `readNativeRedirects`, `applyNativeOperation`, receipts, history, save/restore and draft/source flushes.
- `nativePathExists` and `nativeNavigationTarget`: shared with cards, settings and navigation.
- Page title pointer refresh (`pendingNativePageTitles`, `nativePageTitlePointer`, `pagesBusy`, `flushPendingNativePageTitles`): it is document capture listeners plus `:popover-open`/focus queries on the explorer element. Moving it would turn nearly every line into a DOM port with no policy left to test, so it stays. Rendering clears its pending work through `clearPendingTitles()`.

Guards kept: creation awaits the host's site read first; after it, `planNew(request, true)` refuses an unread home page. With Add to navigation, generation, setup scope and every site path's source captured before `ensureIndex` are re-checked after it ("The page template or repository changed. Create the page again."); the operation carries those `expectedSources` unchanged. A folder page re-reads site and draft scope after the site read, restores a deleted draft instead of creating, and refuses an occupied URL. Retitle still guards generation, scope and the target route, not site identity. Tree render order is unchanged: no view, no site or hidden panel returns before pending title work is consumed. Tab state survives a non-native project (painted as files) as before; `updateTabs(true)` resets to Pages, and nothing is painted before the tabs exist.

No new imports reach the initial chunk: `nativePageTemplate`, `editNavigation`/`readNavigation`, `nativePageUrl`, `nativeSitePaths`, `nativeRouteFile` and `nativePageLabel` were already in main's graph.

## Verification

Node `24.21.0`:

- `npm run check`: passed.
- `npm test`: 1,109 passed (1,100 + 9 new), zero failures.
- `tests/pages-controller.test.ts` new cases: tab selection/reset/non-native painting and unmounted tabs; tree render with new drafts, open file, focus, hidden/no-site refusals and pending-title consumption; new-page planning messages, occupied target, typing vs create, unread home; label and address; create refusal on unread site, commit, card path; Add to navigation refusals on generation, scope and source drift during indexing, and the guarded operation; folder page restore, occupied URL, commit and unread refusal; Add card without card grids falls through to the page commit; a folder page is not created when site or draft scope goes during the site read. The retitle tests now observe the tree render instead of the removed `refreshPages` port, with the same assertions.
- Strict test TypeScript check of `tests/pages-controller.test.ts`: passed.
- `npm run build:ui`: passed. `npm run test:budget -- --no-build`: 347 KB gzip before first preview paint (budget 350 KB), unchanged from base.
- `git diff --check`: passed.

Browser (port 5216, one worker, flock):

- Pages specs (11 files: native-file-ops, native-page-urls, native-file-move-race, native-page-title-refresh, native-page-structure, native-lazy-panels, native-create, native-cards, native-card-paths, native-routing, native-images-tab): 95 passed, 0 failed.
- `@smoke`: 32 passed, 0 failed.
- Full native-save is the lead's run on the candidate head.
