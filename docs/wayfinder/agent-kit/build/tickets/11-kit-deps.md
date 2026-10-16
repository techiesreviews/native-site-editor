---
title: "kit deps: the one way to add a package, and the lockfile check"
type: task (AFK)
status: closed
assignee: ak-11
blocked_by: [01-kit-front-door]
builder: sol
---

## What

- Follow the kit layout in [the map](../../map.md#notes): one executable in `scripts/agents/kit.d/`, a `# kit: <summary>` line, `--help`, Node 24 and owner from `kit-lib`, one final `RESULT:` line, own test file.
- `kit deps check`: compares `package-lock.json` with the shared `node_modules` (each top-level locked package present at the locked version via `node_modules/<name>/package.json`); prints mismatches; exit 1 on any. `kit pr` uses it.
- `kit deps add <pkg>[@version] [--dev]`: under `flock /tmp/ase-node-modules.lock`: updates package.json and package-lock.json in the current worktree with `npm install --package-lock-only`, then installs only that package into the shared `node_modules` with `npm install --no-save --no-package-lock --prefix <shared parent>`-style command that never removes or changes other packages (verify with `kit deps check` before and after; abort and report if anything else changed). Document why: other runners share that folder.
- Never run against the real shared folder in tests: use a temp prefix with a local tarball package.

## Files

- `scripts/agents/kit.d/deps`
- `scripts/agents/deps-check.mjs`
- `tests/kit-deps.test.ts`

## Done when

- Unit tests: check detects missing/mismatched packages; add on a temp prefix leaves other packages untouched.
- Sol review saved under the main root `.scratch/reviews/`; landed on `dev` with CI green.

## Done (2026-10-16)

`scripts/agents/kit.d/deps` + `scripts/agents/deps-check.mjs`, tests in `tests/kit-deps.test.ts` (25).

- `kit deps check [--lock] [--modules]`: every top-level lock entry must be installed at its locked version; absent optional entries (platform binaries) are skipped and counted. Exit 0 `RESULT: ok deps check N packages match (M absent optional skipped)`, exit 1 `RESULT: fail deps check K mismatches: ...` (one `missing`/`mismatch` line each), exit 2 on usage errors or a bad lock. `kit pr` can rely on these.
- `kit deps add <pkg>[@version] [--dev] [--prefix] [--lock-file]`: under `flock /tmp/ase-node-modules.lock`, resolves package.json/lock in a temp copy (`--package-lock-only`, written back to the worktree), installs the package plus its lock-pinned dependency closure into a temp staging prefix (install scripts run there, worktree `.npmrc` and root `overrides` honoured), checks every staged version (nested included) against the lock, preflights conflicts, then copies only new packages and bin links into the shared `node_modules`. Snapshots before and after: any removed or changed entry fails the add. npm never runs against the shared folder, because other runners use it.
- Real shared folder today (read-only): `RESULT: ok deps check 193 packages match (104 absent optional skipped)`; the lockfile and shared node_modules match, no mismatches.
- Tests use temp worktree, temp prefix, temp flock, offline npm with a seeded temp cache and `npm pack` tarballs; never the shared folder.

Commits: b9155452 (build, Sol), d2c296ff (review fixes, Sol), 22d055e1 (review fixes, Claude).
Validation: `npm run check`, `scripts/agents/unit.sh tests/kit-deps.test.ts` (25 pass), `npm run lint`, `bash -n`.

Review (Sol, `.scratch/reviews/ak-11/20261016T124429Z` and `20261016T125537Z`): fixed 5, rejected 0. Round 1: staging re-resolved ranges (false conflicts), install scripts skipped, `.npmrc` not used in staging. Round 2: nested closure entries unpinned (now verified against what Node would load; drift aborts before any write), npm aliases lost their real name in pins.
