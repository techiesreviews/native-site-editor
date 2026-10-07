# P5.3: agent connection controller

Base: `99470b7`. Branch: `build/p5-agent-controller`.

`src/controllers/agent-controller.ts` now owns the agent menu instance, pending lazy mount, connection-discovery probe, one early retry, polling state and focus/visibility/storage listeners. `main.ts` supplies the account, current host, shared app store, lazy loader and existing UI callbacks. It retains agent context construction and command application; those are separate concerns and remain unchanged. There is no second menu instance in the host.

The agent menu UI stays behind the existing dynamic import and chunk-recovery loader. Repository reads derive directly from the app store and require a loaded snapshot and the original account/host. Discovery still probes immediately on start, polls every 30 seconds only while visible, wakes on focus and visibility changes, and schedules one 3-second retry after a transient initial failure. A consent storage event can lazy-mount the menu and forward consent after loading, provided the same account and host remain current.

The lifecycle has a bounded set of fixes alongside extraction:

- Destroy removes controller listeners and cancels its interval/retry. It disposes and removes the menu root, invalidates pending work and permits a later start to register listeners again.
- Lazy loads are identified by account, host and lifecycle epoch. A replaced host/account can begin its own mount without waiting for an obsolete load; an old load's finalizer cannot clear the new pending mount.
- Discovery requests carry lifecycle and probe identity. A destroyed or stopped probe cannot mount a menu or schedule a retry. An old request's finalizer cannot clear a newly started probe's in-flight lock.
- Ask prompts capture the original menu and identity proof. Sending through a stale prompt refuses with “The agent connection changed. Ask again.” rather than dispatching through a replacement menu.

The controller uses small injected browser ports for deterministic lifecycle tests; the default ports use the existing browser fetch and timer behavior. The menu's own hub synchronization and consent handling remain in the lazy menu module.

## Verification

All commands use Node `v24.21.0`, with `/home/ubulex/.npm/_npx/387698761821791d/node_modules/node/bin` first in `PATH`.

- `npm run check`: passed.
- `node --import tsx --test tests/agent-controller.test.ts`: 8 passed, 0 failed. Covers load deduplication and retry, account/host changes, teardown and restart races, visibility and one early retry, stale probe finalizers, consent forwarding, captured Ask refusal and repository signal reads.
- `node_modules/.bin/tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --allowImportingTsExtensions --skipLibCheck --types node,vite/client tests/agent-controller.test.ts`: passed. The first invocation without `--ignoreConfig` stopped with TS5112; the corrected invocation passes.
- `npm test`: 977 passed, 0 failed, 0 skipped.
- `npm run build:ui`: passed; existing Vite large-chunk warning remains. Entry JavaScript: 823.92 KB, 274.59 KB gzip. Agent menu remains a separate 8.05 KB chunk, 3.50 KB gzip. Monaco remains separate.
- `git diff --check`: passed.

Browser checks, smoke, byte budget and cold-start measurements were not run in this worktree. The orchestrator runs browsers serially. Suggested focused check: `tests/native-save/native-mcp.spec.ts`, followed by the shared smoke and budget commands. Build sizes are not a measured pre-paint budget, and no timing target is claimed here.

The worktree uses the existing dependency-installation symlink; no dependency or app-store files changed. No push, merge, deploy or external-system write was performed.
