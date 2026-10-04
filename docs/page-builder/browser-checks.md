# Browser fixture checks

The native-save server serves `fixtures/native-starter` by default. Tests that depend on the actual starter must use that fixture explicitly. These commands select the matching specs and reject conflicting fixture settings before starting a browser:

```sh
npm run test:browser:default -- --port 5296 --output .scratch/browser-default
npm run test:browser:actual -- --port 5296 --output .scratch/browser-actual
npm run test:browser:native-static -- --port 5297 --output .scratch/browser-native-static
```

The native-static command needs the archived fixture at `.scratch/native-static-preview`. It sets both `ASE_NATIVE_SAVE_FIXTURE` and `STATIC_SECTIONS_FIXTURE=native`. The actual/default commands require `STATIC_SECTIONS_FIXTURE` unset. The static-sections spec contains separate actual and native groups; its existing group guards select the appropriate assertions.

Use `--check` to print the selected files without starting a server. Use `--list` to ask Playwright to list tests without starting a server. `--spec` filters the group by a filename substring; other options, including `--grep` and `--output`, pass to Playwright:

```sh
npm run test:browser:actual -- --check
npm run test:browser:actual -- --list --spec native-editor-json.spec
npm run test:browser:actual -- --spec native-fields-migration --grep 'Fields' --port 5296
```

Known fixture paths accept relative paths, absolute paths, and symlinks. Linked Git worktrees also recognize the main checkout's known fixture paths. Compatible copies at other paths need an explicit identity; filenames and page contents do not determine identity:

```sh
ASE_NATIVE_SAVE_FIXTURE=/absolute/path/to/actual-copy ASE_NATIVE_SAVE_FIXTURE_KIND=actual npm run test:browser:actual -- --port 5296
ASE_NATIVE_SAVE_FIXTURE=/absolute/path/to/native-static-copy ASE_NATIVE_SAVE_FIXTURE_KIND=native-static npm run test:browser:native-static -- --port 5297
```

Only set an identity for a copy that preserves that fixture's contract. Unknown paths without an identity and known paths with conflicting identities fail immediately. A missing fixture can be inspected with `--check`, but cannot run tests.

`npm run test:browser` remains the unfiltered Playwright command. Without `ASE_NATIVE_SAVE_FIXTURE`, actual-only specs clearly skip. Explicitly selecting a wrong fixture for those specs raises a fixture error before UI setup. Real failures on the correct fixture remain failures.

The wrapper's actual manifest contains the existing actual-only specs and `native-structure-readiness.spec.ts`. New `*-actual.spec.ts` files join automatically; register other actual-only names in `scripts/native-browser-tests.mjs` and add the shared fixture guard. Keep native-static tests in their separate group. Use distinct ports and output directories for concurrent runs.
