---
title: "kit deps: the one way to add a package, and the lockfile check"
type: task (AFK)
status: open
assignee:
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
