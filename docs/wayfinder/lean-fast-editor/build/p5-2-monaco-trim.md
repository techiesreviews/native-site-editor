# P5.2: Monaco contribution trim

Trim the editor contribution registrations while keeping the existing HTML, CSS,
JSON and JavaScript/TypeScript workers and site-file grammars. The code panes keep
find/replace, folding, bracket matching, suggestions, hover, diagnostics,
multi-cursor editing, comments, formatting, context menus, diff views and
read-only messages.

Monaco 0.56's internal worker manager imports the complete editor contribution
set as side effects. `vite-monaco-trim.ts` removes only those editor registration
imports, preserving the worker manager implementation and unrelated side effects.
Apply the same transform to production and development dependency pre-bundling.
`monaco.ts` explicitly imports the retained contributions and their services.

## Size evidence

Parent measured the existing phase-4 baseline build and this candidate with the
same Python gzip method. Sum the two Monaco-related JavaScript chunks because
Rolldown splits the editor API from the code pane:

| Artifact | Baseline gzip bytes | Candidate gzip bytes |
| --- | ---: | ---: |
| code-editor + editor.api | 972,222 | 868,182 |
| ts.worker | 1,482,315 | 1,482,315 |
| index | 268,287 | 268,284 |

The Monaco-related pair saves 104,040 bytes (101.60 KiB, 10.7%). JavaScript
IntelliSense remains worker-backed; the TypeScript worker is unchanged.

## Validation

- `npm run check`: passed.
- `npm test`: 965 passed, 0 failed, 0 skipped.
- `npm run build:ui`: passed; existing large-chunk advisory remains.
- Production browser tests: pending parent-coordinated run to avoid simultaneous
  browser servers. No browser test contracts were weakened.

New `native-monaco-features.spec.ts` covers editing keys and clipboard, drag and
unusual line terminators, find/replace, CSS folding/brackets/comments/colors,
CSS diagnostics/hover/suggestions, JS completion/signatures/hover/definition/
references/rename/diagnostics/code actions, formatting/navigation/context menu,
HTML links/completion/folding, and a read-only history diff.

Run the new spec with `ASE_NATIVE_SAVE_DIST=1`, alongside
`native-editor-features.spec.ts`, `native-monaco-deferred.spec.ts`, and existing
Save/history regression coverage. Development pre-bundling can retain dropped
contributions, so production browser coverage is required before acceptance.

## Remaining review risks

Contribution/service dependencies can change with Monaco upgrades. Keep the
production feature tests when revising this list or upgrading Monaco. The trim
intentionally removes unused editor actions described in `monaco.ts`; review
that list alongside browser evidence before merge. No deploy or remote timing
measurement has run for this slice.
