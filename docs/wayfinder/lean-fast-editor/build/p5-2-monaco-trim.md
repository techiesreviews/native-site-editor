# P5.2: Monaco contribution trim

Trim the editor contribution registrations while keeping the existing HTML, CSS,
JSON and JavaScript/TypeScript workers and site-file grammars. The code panes keep
find/replace, folding, bracket matching, suggestions, hover, diagnostics,
multi-cursor editing, comments, formatting, context menus, diff views and
read-only messages. Sticky scroll, document-symbol navigation, inlay hints,
cursor undo, platform editing bindings, indentation and font-size actions remain
available with their existing Monaco defaults.

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
| code-editor + editor.api | 972,222 | 884,426 |
| ts.worker | 1,482,315 | 1,482,315 |
| index | 268,287 | 268,280 |

The Monaco-related pair saves 87,796 bytes (85.74 KiB, 9.0%). JavaScript
IntelliSense remains worker-backed; the TypeScript worker is unchanged.

## Validation

- `npm run check`: passed.
- `npm test`: 965 passed, 0 failed, 0 skipped.
- `npm run build:ui`: passed; existing large-chunk advisory remains.
- Production browser tests: pending parent-coordinated run to avoid simultaneous
  browser servers. No browser test contracts were weakened.

The first diagnostic browser run used:

```sh
PATH=/home/ubulex/.npm/_npx/387698761821791d/node_modules/node/bin:$PATH ASE_TEST_PORT=5581 ASE_NATIVE_SAVE_DIST=1 npx playwright test --project=native-save native-monaco-features native-editor-features native-code-diff native-monaco-deferred
```

It matched 26 tests (there is no `native-code-diff` spec): 19 passed, 7 failed.
All 9 new UI feature tests passed. The 7 failures were in older specs that
import `/src/components/monaco.ts` or `/src/components/code-editor.ts`, or
intercept source-module URLs to defer Monaco. The production fixture serves
hashed build assets, so these source imports fail and the interceptions do not
delay the production chunk. These contracts remain intact and require the
development fixture. Evidence: `.scratch/p5-review/monaco-targeted.log`.

This diagnostic run began against an earlier build and overlapped the final
worker-import transform refinement. It is not acceptance evidence for the final
code checkpoint; it also predates the restored default-enabled and keyboard
contributions. The parent coordinates a fresh production UI run and
the existing source-dependent specs against the development fixture.

New `native-monaco-features.spec.ts` covers editing keys and clipboard, drag and
unusual line terminators, find/replace, CSS folding/brackets/comments/colors,
CSS diagnostics/hover/suggestions, JS completion/signatures/hover/definition/
references/rename/diagnostics/code actions, formatting/navigation/context menu,
HTML links/completion/folding, a read-only history diff, sticky scroll and
Go to Symbol, cursor undo and existing command-palette editing actions. There
are now 11 production UI tests; their final run remains pending.

Run the new spec with `ASE_NATIVE_SAVE_DIST=1` and production-compatible
Save/history coverage. Run `native-editor-features.spec.ts` and
`native-monaco-deferred.spec.ts` against the development fixture. Development
pre-bundling can retain dropped
contributions, so production browser coverage is required before acceptance.

## Remaining review risks

Contribution/service dependencies can change with Monaco upgrades. Keep the
production feature tests when revising this list or upgrading Monaco. The trim
intentionally removes unused editor actions described in `monaco.ts`; review
that list alongside browser evidence before merge. No deploy or remote timing
measurement has run for this slice.

The initial copied trim incorrectly described sticky scroll and inlay hints as
off by default and removed existing editing actions. Restored document symbols,
sticky scroll, Go to Symbol, inlay hints, word-part movement, cursor undo,
transpose and caret operations, indentation, font zoom and quick-access help.
The size table above measures this corrected build. Re-ran `npm run check`,
`npm test` (965 passed), `npm run build:ui` and `git diff --check`: all passed.

The first production run of the restored candidate (`e1194d9`) passed 10 of 11
new UI tests. The sticky-scroll fixture failed before its feature assertions:
the short-file `source()` helper only reads virtualized rendered rows, while
that fixture contains 94 lines. Its setup now verifies the complete text through
Ctrl+A/C and the Clipboard API, clearing the clipboard before copying so the
original pasted text cannot produce a false pass. The original short-file helper
and the existing nine feature contracts remain unchanged. Browser rerun is
pending; check, 965 unit tests, build and diff whitespace verification passed.
