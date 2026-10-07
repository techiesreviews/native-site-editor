# P5.1: shared application store

Base: `963f569`. Branch: `build/p5-app-store`.

This first structure slice introduces `@preact/signals-core` and a small `createAppStore` seam. Repository, branch, snapshot, native preview selection and the open file path now live in signals. `main.ts` reads and writes those signals directly; the former module-level variables are removed. Controllers and rendering remain in place for later, separately reviewable extractions.

The branch is writable and exists before its snapshot arrives. The branch picker supplies user navigation input and renders the selected branch; loading and guard fallbacks read the store. Existing checks against the loaded snapshot's branch still use that snapshot, preserving their distinction from navigation intent. Repository reset, branch navigation and snapshot unloading batch related changes so signal subscribers see coherent state. Existing request generations, repository identity guards and snapshot identity guards remain in place.

The app store receives the existing Monaco-free draft text store from `source-editor.ts`. It subscribes to draft events, exposes a revision and derived changed-file, unpersisted-edit and history signals, and provides an idempotent subscription disposer. It owns no duplicate draft text or history. `DraftTextStore.clear()` intentionally emits no event, so the existing workspace reset explicitly refreshes the bridge after `clearDrafts()`. Other host-owned silent draft mutations can use the same refresh seam. Monaco remains dynamically imported through the existing gate.

## Verification

Run with Node `v24.21.0` by putting `/home/ubulex/.npm/_npx/387698761821791d/node_modules/node/bin` first in `PATH`.

- `npm run check`: passed.
- `node --import tsx --test tests/app-store.test.ts`: 4 passed, 0 failed. Covers batched navigation, branch state before the snapshot, draft edit/undo/saved updates, explicit clear refresh, subscription disposal and coherent multi-file receipt observations.
- `npm test`: 969 passed, 0 failed, 0 skipped.
- `npm run build:ui`: passed; Vite's existing large-chunk warning remains. Entry JavaScript: 822.42 KB, 274.00 KB gzip. Monaco remains in separate code-editor/editor.api chunks. This is build output, not a measured pre-paint byte budget.
- `git diff --check`: passed.

Browser tests, `@smoke`, byte budget and remote cold-start measurements were not run in this worktree. The orchestrator owns the shared browser run to avoid concurrent browser memory pressure. No deploy, push or merge was performed.

Suggested focused browser checks: `native-branch-menu.spec.ts`, `native-change-status.spec.ts`, `native-history.spec.ts`, `native-save.spec.ts`, `native-code-visible.spec.ts`, followed by `npm run test:browser:smoke` and `npm run test:budget`.

The worktree's original `node_modules` symlink was removed before dependency installation; this worktree has its own installation. The root worktree's dependencies were not changed. All verification uses Node 24.
