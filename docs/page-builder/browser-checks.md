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
npm run test:browser:actual -- --list --spec native-editor-json-lifecycle.spec
npm run test:browser:actual -- --spec native-site-settings --port 5296
```

Known fixture paths accept relative paths, absolute paths, and symlinks. Linked Git worktrees also recognize the main checkout's known fixture paths. Compatible copies at other paths need an explicit identity; filenames and page contents do not determine identity:

```sh
ASE_NATIVE_SAVE_FIXTURE=/absolute/path/to/actual-copy ASE_NATIVE_SAVE_FIXTURE_KIND=actual npm run test:browser:actual -- --port 5296
ASE_NATIVE_SAVE_FIXTURE=/absolute/path/to/native-static-copy ASE_NATIVE_SAVE_FIXTURE_KIND=native-static npm run test:browser:native-static -- --port 5297
```

Only set an identity for a copy that preserves that fixture's contract. Unknown paths without an identity and known paths with conflicting identities fail immediately. A missing fixture can be inspected with `--check`, but cannot run tests.

`npm run test:browser` remains the unfiltered Playwright command. Without `ASE_NATIVE_SAVE_FIXTURE`, actual-only specs clearly skip. Explicitly selecting a wrong fixture for those specs raises a fixture error before UI setup. Real failures on the correct fixture remain failures.

The wrapper's actual manifest contains the existing actual-only specs and `native-structure-readiness.spec.ts`. New `*-actual.spec.ts` files join automatically; register other actual-only names in `scripts/native-browser-tests.mjs` and add the shared fixture guard. Keep native-static tests in their separate group. Use distinct ports and output directories for concurrent runs. The wrapper and test server resolve installed dependencies through Node module resolution, so linked worktrees can use the main checkout’s installation without creating a local `node_modules` symlink.

## Human screen-reader check

This check remains unperformed. Use a disposable fixture with the reviewed application `634d69f` or its verified preview release, and record the screen reader, browser, operating system and application version. An authenticated live preview needs the user's ordinary sign-in; the local fixture needs no real GitHub writes. Include native-static and component pages so both ordinary Structure rows and slot actions are exercised.

1. Navigate Page structure using the screen reader and keyboard. Check that row names, hierarchy, selection and expansion state are understandable. Ordinary selection must not open an inline editor. Reach Edit followed by the visibility eye, and confirm that each action announces its name and current state.
2. Open an inline edit explicitly. Check its field label, Save/Cancel controls and focus on entry and exit. Hide and show a slot; confirm the changed visibility is understandable without looking at the canvas.
3. Open a stylesheet in the Source editor and edit a CSS value. Check rule chip names, keyboard access and focus when hiding and restoring code. Repeat at a narrow viewport.
4. In Page settings General, Search and Social, apply a valid metadata change and exercise a refused operation using the disposable fixture. Check that success, validation and refusal messages are announced, and that focus and unsaved input remain usable. Open and cancel a deletion confirmation; check the dialog name and returned focus.
5. Edit Code until a collection refresh settles, then use Undo and Redo through the typing and generated-card steps. Check that operation results and remaining edits are understandable from the accessible controls and status messages.

Record observed announcements and focus for each step, including any failure and reproduction details. Leave the completion-checklist item unchecked until a human has run this protocol and any blocking findings have been resolved; automated ARIA/keyboard assertions and screenshots do not substitute for this evidence.
