# P5.1: shared application store

Base: `963f569`. Branch: `build/p5-app-store`.

This first structure slice introduces `@preact/signals-core` and a small `createAppStore` seam. Repository, branch, snapshot, native preview selection and the open file path now live in signals. `main.ts` reads and writes those signals directly; the former module-level variables are removed. Controllers and rendering remain in place for later, separately reviewable extractions.

The branch is writable and exists before its snapshot arrives. The branch picker supplies user navigation input and renders the selected branch; loading and guard fallbacks read the store. Existing checks against the loaded snapshot's branch still use that snapshot, preserving their distinction from navigation intent. Repository reset, branch navigation and snapshot unloading batch related changes so signal subscribers see coherent state. Existing request generations, repository identity guards and snapshot identity guards remain in place.

The app store receives the existing Monaco-free draft text store from `source-editor.ts`. It subscribes to settled draft-state invalidations, exposes a revision and derived changed-file, unpersisted-edit and history signals, and provides an idempotent subscription disposer. It owns no duplicate draft text or history. `DraftTextStore.subscribeState()` also reports persistence-only mutations and full workspace clears. Controllers do not need a manual refresh convention. The manual refresh surface and redundant workspace-reset refresh were removed. Monaco remains dynamically imported through the existing gate.

## Initial slice verification (`99470b7`)

Run with Node `v24.21.0` by putting `/home/ubulex/.npm/_npx/387698761821791d/node_modules/node/bin` first in `PATH`.

- `npm run check`: passed.
- `node --import tsx --test tests/app-store.test.ts`: 4 passed, 0 failed. Covers batched navigation, branch state before the snapshot, draft edit/undo/saved updates, explicit clear refresh, subscription disposal and coherent multi-file receipt observations.
- `npm test`: 969 passed, 0 failed, 0 skipped.
- `npm run build:ui`: passed; Vite's existing large-chunk warning remains. Entry JavaScript: 822.42 KB, 274.00 KB gzip. Monaco remains in separate code-editor/editor.api chunks. This is build output, not a measured pre-paint byte budget.
- `git diff --check`: passed.

Browser tests, `@smoke`, byte budget and remote cold-start measurements were not run in this worktree. The orchestrator owns the shared browser run to avoid concurrent browser memory pressure. No deploy, push or merge was performed.

Suggested focused browser checks: `native-branch-menu.spec.ts`, `native-change-status.spec.ts`, `native-history.spec.ts`, `native-save.spec.ts`, `native-code-visible.spec.ts`, followed by `npm run test:browser:smoke` and `npm run test:budget`.

The worktree's original `node_modules` symlink was removed before dependency installation; this worktree has its own installation. The root worktree's dependencies were not changed. All verification uses Node 24.


## Follow-up: reliable draft-state invalidation

Review found that the draft bridge could cache `unpersisted = true` after `retry()` successfully persisted the draft or `adopt()` accepted an outside record with the same base. A clear could also report the cleared journal while still caching files. Regression tests were added first: all three cases failed before the fix (four failures including the existing clear test).

The draft store now has a separate `subscribeState(listener)` surface. It invalidates after the outer mutation and public event queue settle, including persistence-state transitions, record adoption, full clears, revision-only writes and persisted entries loaded by a refused receipt. Existing `DraftEvent` payloads, order and event counts stay intact; no synthetic text event is used for persistence-only changes. Multi-step entry/base and clear operations intentionally delay their public events through the existing mutation batch so listeners observe completed state. State-listener reentrancy schedules another invalidation without recursively delivering state callbacks or losing the follow-up history step. A retry that changes nothing does not notify, avoiding an effect/retry loop when storage keeps failing. The app-store bridge subscribes to this surface rather than `DraftEvent`.

Follow-up checks (Node `v24.21.0`):

- Red: `node --import tsx --test tests/app-store.test.ts`: 3 passed, 4 failed before the fix, reproducing stale retry/adopt/clear values.
- `npm run check`: passed.
- `node --import tsx --test tests/app-store.test.ts tests/draft-store.test.ts`: 41 passed, 0 failed; includes settled multi-file observations, event-listener and state-listener reentrancy, unsubscribe/error isolation and no-op retry coverage.
- `npm test`: 978 passed, 0 failed, 0 skipped.
- `npm run build:ui`: passed; existing large-chunk warning remains. Entry JavaScript: 822.87 KB. Monaco remains separate.
- Direct TypeScript check of `tests/app-store.test.ts` and `tests/draft-store.test.ts` using `--ignoreConfig` and the project-compatible compiler options: passed.
- `git diff --check`: passed.
- Browser/smoke/byte budget: not run for this follow-up; the orchestrator owns integration validation.

The orchestrator measured the earlier frozen `99470b7` slice at 339 KB before paint, within the 350 KB byte target, with cold/warm medians of 1.298 s / 0.892 s in that local run. Those timings exceed the 1.0 s / 0.4 s local targets; this note does not claim all budgets are met. They are baseline results, not measurements of the follow-up fix.
