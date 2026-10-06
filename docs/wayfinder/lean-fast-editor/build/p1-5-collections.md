# P1.5: remove collections

Collections authoring is removed without compatibility for old recipes or generated
cards. Static card grids remain ordinary editable HTML. Add card still copies a
card, creates linked pages and records page/card edits in one undo operation.

## Changes

- Removed the Collections panel and CSS, nine collection model, bake, host and
  generated-content modules, and the collection-only `card-listings.ts` layer.
- Removed generated/unchecked Structure ownership, generated-card edit guards,
  Code typing refresh, recipe recovery and collection asset-reference hooks.
- Every operation caller now uses `applyNativeOperation`. P1.3 page re-keying and
  shared-section link rebasing remain in `sidecar-pages.ts`.
- `.editor/page-builder.json` stays at version 1. Its next write strips
  `collections` and `pages[*].fields`, preserving `reusableSections`,
  `pages[path].sections`, `pages[path].pageParts` and unknown metadata.
- Section targets fingerprint the full opening tag and report “Section target”
  errors. The listing recipe attribute exception is removed.
- Static Add card infers page folders from ordinary links. Recipe folder
  restrictions and automatic collection baking are removed. Native component
  `data-if` handling remained after P1.5; P1.6 removes it from the runtime, card-grid helpers and site conventions.
- Removed ten collection-only unit files, eleven browser specs and their fixture;
  retained and adapted mixed coverage. Browser launcher lists retain existing specs.
- Deleted four collection-only documents and updated current feature documentation.

## Validation

- `npm run check`: pass.
- `npm test`: 884 passed, 0 failed.
- Independent read-only application review: Claude Opus 5.5, medium, no actionable
  defects. Removed its two noted unused collection helpers afterward.
- Focused default asset specs: 3 passed, 1 known dev refusal-wording failure
  (old line 116, now 108).
- Focused actual-starter static sections: 12 passed, 1 skipped, 1 initial Add
  dialog timeout. That case and the static-grid preservation case pass unchanged
  rerun (2/2); the custom-section case also passes on HEAD. This is an unexpected
  transient, not a proven pre-existing failure.
- Touched elements-compat spec: 9 passed.
- Full `ASE_TEST_PORT=5371 npm run test:browser`: 628 passed, 85 skipped,
  16 failed (46.1 minutes). Fourteen failures match the supplied dev list:
  asset-references (old 116, now 108), create 251/344, elements-host
  66/95/115/140, file-ops 374, operation-history 8/77, page-urls 78/232,
  routing 38 and selector 250. Selector 407 passed.
- One additional full-run failure was “Test not found in the worker process”
  in elements-compat: its title was changed during the run's final test cleanup.
  This was a verification scheduling mistake, not a product assertion failure.
  The final spec passes all nine focused cases.
- Final frozen rerun on port 5371 of canvas-avoid and elements-compat:
  11 passed, 0 failed.
- Full-run canvas avoidance encountered a repository navigation during
  `locator.evaluate`. Both variants pass unchanged focused rerun (2/2), and
  no-preference passes three further repeats. HEAD passes both variants too.
  This is an unexpected transient, not a proven pre-existing failure.

## Bundle

`npm run build:ui -- --configLoader runner` succeeds. The default bundled config
loader cannot write through this worktree's read-only shared `node_modules`
symlink; the runner loader avoids that temporary write without modifying shared
files or project configuration.

An untouched HEAD archive measures 314.70 kB gzip for the main chunk; the supplied
handoff baseline was 321 KB. After removal: 285.36 kB gzip, down 29.34 kB (9.3%)
against measured HEAD, or 35.64 KB against the supplied baseline.

Changes are intentionally uncommitted. No deployment or GitHub write was performed.

## Evidence and proposed commit

Ignored `.scratch/p15-*` logs retain unit, build, review and focused/full browser
results. Full-run traces remain in `.scratch/native-save/results`. All test
servers started for this slice exited; no unrelated process was stopped.

```text
refactor(editor): remove collections and generated-card ownership

Co-Authored-By: Sol (gpt-6.1-sol) <noreply@openai.com>
```
