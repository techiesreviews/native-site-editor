# Phase 5.12: Boot controller

Base: `d2136fe` (dev).

`src/controllers/boot-controller.ts` owns `start()` (concurrent session/repository reads through `startBootReads`, install return, auto sign-in, URL error cleanup, owned-failure check), the hash-change handler, the drafts promise (`draftsReady()`), the install-return refresh flag (`refreshPending`/`takeRefresh`), repository onboarding, `fetchList`, `needsRecovery`, `recover`, `ensureList` and the repository workspace states (`loading`/`ready`/`failed`/`listed`), plus the auto sign-in cancel handle. The pure `planRepositoryOpen({ list, linked, hashPresent, knownBefore, remembered })` returns `empty | invalid-link | unavailable-link | open{id, resume?} | choose`; the host's `loadRepositories` calls it and keeps the DOM half. Main loses 132 lines (8,393 to 8,261).

Ports: `generation` (read only), `source`, `url`, `replaceUrl`, `redirect`, `assign`, `readSession`, `readRepositories(refresh)` (both around `apiResponse`), `loadDrafts`, `onDraftError`, `session`/`adoptSession` (`info` stays in main), `enterWorkspace`, `loadRepositories`, `renderLogin`, `retainLink`, `showError`, `storage`, `setTimer`/`clearTimer`, `menu` and `applyList`. The host keeps generation bumps, `loadRepositories`' DOM, `chooseRepository`, `loadSnapshot`, `refreshRepositoryList`, the `repositories` array, and the window/document listener registration (now calling `boot.onHashChange` and `boot.start`).

Invariants kept: generation and source are checked after `reads.session` and after `takeRepositories`; `boot-reads.ts` scope checks are unchanged. Onboarding is applied only from the adopted receipt; tag mismatch falls back to the session's legacy list or the normal listing; the speculative reader writes nothing. Signed-out install/setup return calls `location.replace("/auth/login")`; signed-in return cleans the URL, ignores the prefetch and lists with `refresh=1`, consuming the flag once. The handoff is captured in `onStarted`; ownership of a late failure compares generation, session identity and source. Drafts start before `enterWorkspace`, `loadSnapshot` awaits `draftsReady()`, and the draft `onError` is installed after the load. Hash changes do nothing until a signed-in session is adopted. `renderLogin` calls `boot.reset()`, which clears list-loaded, workspace state, the in-flight list request and onboarding. As before, the drafts promise and a pending auto sign-in cancel are not cleared by login.

One ordering change: `readWorkspaceUrl()`/`readWorkspace()` are now read for the plan right after the listing is stored, before the interrupted-wizard checklist start, instead of after it. Both are synchronous reads; nothing in between changes the hash.

## Verification

Node `24.21.0`:

- `npm run check`: passed.
- `npm test`: 1,067 passed (1,054 + 13 new), zero failures/skips.
- `tests/boot-controller.test.ts` (13): both reads start before the session resolves and same-tag onboarding is adopted; tag mismatch falls back without onboarding; signed-out and signed-in install return; generation bump while waiting for repositories and before the session; late, owned and replaced-session errors; session error; drafts ordering and `onError` after load; hash change before/after sign-in; `ensureList` dedupe, recovery, reuse and stale-menu refusal; reset; table-driven `planRepositoryOpen` (11 cases).
- Strict test TypeScript check passed (`--ignoreConfig --noEmit --strict --types node,vite/client`).
- `npm run build:ui`: passed; existing large-chunk advisory remains.
- `ASE_BUDGET_PORT=5594 npm run test:budget -- --no-build`: 345 KB gzip before first preview paint (budget 350 KB), within.
- `git diff --check`: passed.

Logs: `.scratch/p5-review/boot-controller-*.log`.

Lead's serial browser run on `260fa94` (port 5216, one worker; logs
`.scratch/p5-review/boot-browser-*.log`):

- Boot-focused native-save specs (`native-boot-parallel`, `native-startup-hash`,
  `native-boot-requests`, `native-onboarding`, `fake-github-onboarding`,
  `native-setup-wizard`, `native-setup-checklist`, `native-lazy-panels`,
  `native-draft-storage`, `native-branch-menu`): 69 passed.
- `@smoke`: 32 passed.
- Full native-save: 708 passed, 85 skipped, 0 failed.

Claude Opus 5.5 / medium review (root `.scratch/p5-review/claude-boot-controller/`):
verified, no defects. Noted test gaps: the auto sign-in timer and cancel,
`?error=` cleanup and a stale-login `ensureList` refusal have no unit test.
