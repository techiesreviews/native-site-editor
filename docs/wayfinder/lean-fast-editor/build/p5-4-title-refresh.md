# Phase 5.4: resume deferred page titles

Base: `eaaf6b81434f1029c5fe89a30ad1459d691fd400`.

This isolated review branch contains the same product and browser-test patch as combined candidate `47ea16954110cb059b0c4d1e067bc2f177c11c18`, without the separate Monaco lifecycle slice. The browser, unit, and build evidence below was collected on that combined candidate; it does not claim those suites ran on this isolated head. The isolated branch was checked with `npm run check` and `git diff --check`.

A background page-source index can finish while a Pages row menu, Rename input, URL editor, or new-subpage input is active. The existing implementation preserves that interaction, but schedules the eventual title refresh only on the outer explorer's `toggle`. Escape closes the row interaction without toggling the explorer, so route-derived fallback titles can remain indefinitely. The full-suite failure in `native-page-urls.spec.ts:89` waited for `Fern & Kettle` while the row still read `Fern and kettle`, before the subpage creation or deletion steps.

The row menu now reports closure and the Pages tree reports the end of its in-place interactions. The host retains one pending title refresh with the originating index's live guard and explorer identity. A microtask rechecks both identity and busy state, allowing a menu action to open an editor in the same turn without replacing its rows. The pending work is consumed before rendering because rendering itself closes interactions. Deactivation clears it. Other row-menu consumers keep their existing behavior through the optional callback.

The new browser tests hold the `/api/files` response containing the correct encoded page title until the Notes menu, Rename input, URL editor, or new-subpage input is active. They verify that delivery preserves the menu focus or typed value and input focus, then that Escape displays the actual title while keeping focus on Notes and the explorer open. A fourth case preserves a typed new-subpage title and returns focus to its parent after Escape. Existing page URL assertions are unchanged.

## Verification

- Red: the three new tests failed against the unchanged product. Each failed at the shared assertion on line 47: expected the exact `Fern & Kettle` treeitem to be visible; actual result was `element(s) not found`. Correct response contents and preservation of the active interaction passed before that assertion. Log: `.scratch/p5-review/title-refresh-red.log`; traces and contexts: `.scratch/p5-review/title-refresh-red-results/`.
- Green: the three new tests passed (5.6 seconds), `.scratch/p5-review/title-refresh-green.log`.
- `npm run check`: passed, `.scratch/p5-review/title-refresh-check.log`.
- `npm test`: 986 passed, zero failed/skipped, `.scratch/p5-review/title-refresh-unit.log`.
- `npm run build:ui`: passed; existing large-chunk advisory remains, `.scratch/p5-review/title-refresh-build.log`.
- Focused browser run: original page URLs, file operations, and new title-refresh tests, one worker; 19 passed (51.4 seconds), `.scratch/p5-review/title-refresh-focused.log`. After adding the new-subpage case, the four-case target passed (7.3 seconds), `.scratch/p5-review/title-refresh-four-cases.log`.
- Browser-spec TypeScript check and `git diff --check`: passed.
- Node `24.21.0`; browser commands use `npm exec -- playwright test --project=native-save` with `ASE_TEST_PORT=5612`. An initial direct CLI invocation could not find the web-server's `tsx`; the npm invocation supplies the required binary path.

The broader production suite and byte/timing budgets are owned by the integration run. This slice does not claim a new full-suite or budget result. No push, merge, or deployment was performed.
