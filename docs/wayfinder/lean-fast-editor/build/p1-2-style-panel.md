# P1.2 — Remove the Style panel

Branch: `build/p1-2-style-panel`, based on `dev` at `ef00e9b`.

The Style panel, image focal point editor, grid editor and selected-collection
inspector are removed. Image positioning and grid layout are edited in the
Source editor. Generated-card controls can show the collection source; refusal
messages now refer to the Source editor instead of removed inspector actions.

## Removed files

- Panel source and CSS: `style-panel.*`, `style-panel-resize.*`, `style-fields.ts`,
  `style-variables.ts`.
- Panel editors: `grid-editor.*`, `image-focal-point.*`,
  `page-builder/style-image-source.ts` and `selected-collection.ts`.
- Their unit tests, panel-only native-save specs and helpers, inspector-only
  specs, and the isolated `tests/style-widgets/` harness.
- `docs/page-builder/style.md`, `style-widgets.md` and
  `style-consistency-review.md`. Surviving feature and browser-check docs describe
  Source editor workflows.

## Kept consumers

`shared/cascade.ts`, `src/style-cascade.ts`, `src/styles-index.ts`,
`shared/slotted-css.ts`, CSS intelligence and the live CSS writer remain for
Source editor rule chips, static sections, layout operations and stylesheet
completion. `linkedRules` in `main.ts` still resolves the selected element's
rules. The runtime keeps `matchingRules`, declaration probes and selection
refresh on grid resize, which also feed rule chips. MCP `inspect_preview` keeps
its independent `matchingRules()` path. Only panel-only computed defaults leave
the selection payload.

Collection baking, Page settings › Fields, Add card, sidecar page metadata and
agent operations remain for later slices. The inspector is unmounted rather
than moved elsewhere. Browser setup that used it now seeds saved recipes at the
fake GitHub boundary; mixed specs retain their substantive checks.

## Validation

`npm run check` passes. `npm test` passes: 1,101 passed, 0 failed,
0 skipped. `git diff --check` passes. The independent Claude Opus 5.5 review and
follow-up found no remaining removal defects; this is not a full-suite green claim.

Browser counts below are individual runs, including development failures and
focused reruns. They overlap and must not be added together.

| Run | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Touched default specs, first run | 34 | 14 | 7 |
| Default fixes, focused rerun | 15 | 0 | 0 |
| Narrow canvas and JSON race rerun | 2 | 0 | 0 |
| Generated-card source/refusal checks | 2 | 0 | 0 |
| Final collapse specs | 5 | 0 | 0 |
| Actual starter, interrupted first wrapper (child completed) | 42 | 6 | 1 |
| Actual starter, 49-case run | 43 | 5 | 1 |
| Final focused actual rerun, including all seven label cases | 15 | 2 | 0 |
| Native static touched specs | 6 | 1 | 13 |
| Static failure rerun | 1 | 0 | 0 |
| Restored master assertions | 3 | 0 | 0 |
| Preview/cascade suite | 13 | 2 | 0 |
| Preview failure rerun | 2 | 0 | 0 |
| Full `npm run test:browser` (53.3 minutes) | 694 | 27 | 110 |

The full run collected 831 tests before final test-title edits. Its raw result
includes four artifact collisions, two timing failures and three changed-title
failures. All nine pass focused reruns. Separate ports and output directories
were used for subsequent runs. The added/restored refusal coverage was checked
separately.

Fourteen full-suite failures also reproduce in an immutable archive of the base
commit `ef00e9b`: asset-reference refusal wording (1), stale Page settings entry
in creation/history specs (4), missing saved-section catalogue in Add specs (4),
menu expectations in file/page URL specs (3), routing/settings selection (1),
and component CSS load count (1). Four image specs fail with `EROFS` because
their existing screenshot paths point outside this worktree's writable roots.
These checks remain failures; the full suite is not green.

The two remaining actual-starter failures are desktop light/dark field-background
audits. Both reproduce on the base commit. Lifecycle, Source editor history,
collection setup and label checks pass after their adaptations. All touched
default-spec failures were corrected and pass their focused reruns. The static
and preview failures also pass reruns; the preview corrections explicitly select
the target element and exclude the editor's existing viewport layer from an
authored-layer assertion.

Detailed run counts are in `.scratch/p1-2/grunt-verification.md`; command logs
are in `.scratch/p1-2/logs/`. Parent-run preview, static, master and baseline logs,
plus both independent reviews, are in `.scratch/p1-2/`. All test processes exited.
The temporary base archive and `/tmp/p12*.log` files were removed after evidence
was retained.

## Bundle

The ticket 06 baseline is 332 KB gzip. The final Vite report is 320.91 kB gzip
for `dist/assets/index-DLyPr-Vv.js`: 11.09 kB less, approximately 3.34%.
For comparison, Node `gzipSync` measures 317,357 bytes for that same file.
The before/after delta uses Vite's reported metric consistently.

The ordinary build's default config loader cannot write into the read-only
`node_modules/.vite-temp`. `npm run build:ui -- --configLoader runner` succeeds.

## Commit

`git add` cannot create the worktree's `index.lock`: the runtime mounts the shared
Git directory read-only despite its declared writable root. No commit, push,
merge or deployment occurred. The requested commit message and co-author trailer
are prepared in `.scratch/p1-2/commit-message.txt`.
