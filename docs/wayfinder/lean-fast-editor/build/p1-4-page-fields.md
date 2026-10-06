# P1.4: remove Page settings › Fields

Page settings keeps General, Search and Social. The Fields tab, Date/custom-field
form and custom-field migration action are removed. Date and custom metadata can
still be edited directly in HTML through the Source editor.

Collections remain for P1.5. Collection recovery controls move to General. Their values come from HTML metadata and collection
recipe overrides, rather than sidecar page fields. Existing collection baking,
generated cards, asset hooks and source guards remain part of this phase.

`.editor/page-builder.json` keeps its version. Reads ignore legacy
`pages[*].fields`; the next sidecar write strips those fields. Other supported
metadata remains, including top-level `reusableSections`, page `sections`, page
`pageParts` and `collections`. Legacy HTML `field:` metadata stays untouched.

The removal decisions in tickets 07, 14 and 15 describe the full sequence.
Stripping `collections` belongs to P1.5, after this Fields-only phase.

## Validation

- `npm run check`: passed.
- `npm test`: 1,071 passed, no failures.
- Touched default browser specs: 52 passed; the known
  `native-asset-references.spec.ts:116` failure remains.
- Touched actual-starter specs: 14 passed, two visual failures in
  `native-card-paths-starter.spec.ts:126` (light/dark edit-bar input backgrounds).
  Both reproduce on unchanged HEAD `3b9f221`; the narrow variants pass there too.
- Touched native-static shared-file lifecycle spec: five passed.
- The full run found four Images screenshot failures because the spec used
  absolute paths into the read-only main checkout. Those paths now use this
  worktree's `.scratch/t3-continuation`; all 18 Images cases pass on rerun.
- Claude Opus 5.5 reviewed the source diff. Its settings recovery finding was
  fixed: Forget checks the dialog's snapshot through the operation, then refreshes
  its baseline. Browser coverage applies a title in that same dialog and undoes
  both operations separately. Follow-up review found no actionable defects.
- The first full command used port 5331 while
  implementation was still changing. Interrupting its npm parent left Playwright
  running; it eventually completed (504 passed, 200 failed, 100 skipped), with
  widespread Vite/Monaco duplicate-model errors, superseded fixtures and the
  known failures. That run is not the final validation evidence.
- The final frozen-source full run uses port 5335. After the earlier runner
  exited naturally, representative duplicate-model cases were rerun on a fresh
  port 5331 server: five passed, with only the known operation-history line 77
  failure. Manager cleanup is no longer needed.
- Final full run: 684 passed, 100 skipped, 18 failed (50.4 minutes). Four failures
  were the screenshot-path errors above, fixed and verified by the 18/18 Images
  rerun. The other 14 match the supplied pre-existing failures:
  `native-asset-references:116`, `native-create:251/:344`,
  `native-elements-host:66/:95/:115/:140`, `native-file-ops:374`,
  `native-operation-history:8/:77`, `native-page-urls:78/:232`,
  `native-routing:38` and `native-selector:250`. The selector line 407 flake passed.
  No new unresolved product failures remain. All test servers exited after their
  runs. Changes are uncommitted for the manager.

Existing sidecar `pages[path].date` remains a collection fallback when HTML supplies
no date; P1.4 strips only `pages[*].fields`, not other supported page data.
