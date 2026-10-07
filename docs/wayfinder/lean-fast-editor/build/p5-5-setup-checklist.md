# Phase 5.5: setup checklist controller

Base: `49061ebc23d8896a153f123d8229cd4c89b7f028`.

`src/controllers/setup-checklist-controller.ts` owns the checklist instance and loading promise, requested-repository state, persisted progress memory, four-second completion timer, agent spotlight, menu highlight, and teardown. Its public API is `mount`, `refresh`, `start`, `noteAgent`, and `dispose`. The host provides account/repository/scope identity, the existing site/draft-derived setup state, storage, lazy loaders, agent/menu access, and UI actions. Main retains `setupScope`, `setupState`, and the guarded site-settings draft transaction; there is no second draft or repository state.

The checklist still loads only when the project menu requests it or remembered visibility requires it. The spotlight still loads only on Connect. Main retains both existing `lazyModule` loaders and their chunk recovery. Main loses 115 lines (9,007 to 8,892).

The completion callback retains the original account/repository/branch scope and recomputes progress before recording completion, including the first-save undo guard. Disposal also invalidates pending loads, cancels deferred dialog opening and animation-frame focus, closes the active spotlight, and aborts highlight listeners. A pending old load cannot clear a newer loading promise. Deferred opening still happens after the project menu restores focus. A completed name write only remembers the name if the controller lifetime and workspace scope remain current. These bounded lifecycle fixes prevent detached UI resurrection or memory writes to a newly selected repository. Missing workspace state now cancels completion immediately rather than leaving an inert timer until expiry.

## Verification

Node `24.21.0`:

- `npm run check`: passed.
- `npm test`: 991 tests passed, zero failures/skips. Five focused controller tests cover shared mounting, disposal and late-load refusal, account changes, completion across navigation/undo, deferred opening cancellation, and a name save completing after navigation.
- Focused browser-free test TypeScript check: passed using `tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --allowImportingTsExtensions --skipLibCheck --types node,vite/client tests/setup-checklist-controller.test.ts`.
- `npm run build:ui`: passed; existing large-chunk advisory remains.
- `git diff --check`: passed.

Logs are in `.scratch/p5-review/setup-*.log`. An initial test TypeScript check found the fixture's incomplete `Storage` assertion; the port was narrowed to its actual `getItem`/`setItem` needs and the assertion removed before the passing check.

Browser verification is intentionally reserved for the lead's serial run: `tests/native-save/native-setup-checklist.spec.ts`, `native-setup-wizard.spec.ts`, `native-onboarding.spec.ts`, and `native-lazy-panels.spec.ts`, plus smoke and byte budget. No browser, full browser suite, or budget result is claimed for this branch. Claude review, integration, and any release remain separate; no push, merge, or deployment was performed.
