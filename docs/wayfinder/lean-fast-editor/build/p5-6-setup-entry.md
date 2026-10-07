# Phase 5.6: setup entry controller

Base: `ac19da335f29518be4cb92b5b4a1417a670ebcd3`.

`src/controllers/setup-entry-controller.ts` owns the full-screen wizard instance, dismissal state, lazy mounting, initial focus, and teardown for signed-in and fresh-owner setup. Its API is `open`, `openOwner`, `remove`, `close`, `complete`, `active`, and `dismissed`. Ports provide session/owner identity, repository count, connection hint and fallback, memory access, the unchanged lazy loader, root mounting, and existing wizard actions. Main loses 55 lines (8,892 to 8,837).

The host retains GitHub requests, `wizardConnection`, `createSiteInWizard`, `findWizardRepository`, `wizardPreview`, repository creation state, agent prompt generation, and the `finishWizard` transaction including hash navigation and repository loading. Get Started presentation and its repository-return polling remain in the host for a subsequent bounded slice; extracting those here would widen the actions and lifecycle surface beyond the wizard seam.

The signed-in flow still reads memory only after module loading, then checks the same login and empty repository list after both module and connection awaits. Owner setup still checks signed-out state and the same owner URL after loading, reads/writes no memory, and cannot bypass Connect. Lazy `loadWizard` remains in main through the existing recovery gate and is invoked only by these original entry points.

Same-identity pending requests share one promise. An epoch invalidates removed or superseded pending work, and an old completion cannot clear a replacement loading request. Login rendering removes any prior wizard or pending mount. Removal calls the component's existing `destroy`, retaining its dialog/focus cleanup. Detached remember, finish, and exit callbacks cannot act on a replacement wizard. Exit still clears memory and returns signed-in empty accounts to Get Started; owner exit only dismisses its UI. Completing setup leaves the repository transaction in the host.

## Verification

Node `24.21.0`:

- `npm run check`: passed.
- `npm test`: 997 passed, zero failures/skips.
- Six focused lifecycle tests passed: deduplicated mount/focus, teardown and replacement loading, account/repository changes during module loading, the same changes during connection loading, owner URL/sign-in guards without memory access, and stale callbacks after exit/restart.
- Test TypeScript check passed: `tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --allowImportingTsExtensions --skipLibCheck --types node,vite/client tests/setup-entry-controller.test.ts`. The initial fixture omitted required memory timestamp `at`; it was fixed before the passing run.
- `npm run build:ui`: passed; existing large-chunk advisory remains.
- `git diff --check`: passed.

Logs: `.scratch/p5-review/setup-entry-*.log`. No browser or budget run was started; the lead owns serial `native-setup-wizard.spec.ts`, `native-onboarding.spec.ts`, `native-setup-checklist.spec.ts`, `native-lazy-panels.spec.ts`, smoke, and budget verification. No Claude review, push, merge, or deployment was performed.
