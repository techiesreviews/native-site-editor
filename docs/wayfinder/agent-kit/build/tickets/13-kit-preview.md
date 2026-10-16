---
title: "kit preview: deploy the preview from its own temp worktree"
type: task (AFK)
status: closed
assignee: ak-13
blocked_by: [01-kit-front-door]
builder: sol
---

## What

- Follow the kit layout in [the map](../../map.md#notes): one executable in `scripts/agents/kit.d/`, a `# kit: <summary>` line, `--help`, Node 24 and owner from `kit-lib`, one final `RESULT:` line, own test file.
- Creates (or reuses) a detached worktree of `origin/dev` at the main root's `.scratch/preview-deploy/` with the shared `node_modules` symlink, under the existing `/tmp/ase-deploy-preview.lock`; runs `npm run deploy:preview` there; prints `RESULT: ok preview <version-id> <sha>` and checks that the live `index-*.js` matches the built one (cache buster), retrying that check for up to 2 min.
- `deploy-preview.sh` becomes a thin wrapper (no more hand-made throwaway worktree).
- Only the lead runs it (runner-extras). `--dry-run` stops before deploying.

## Files

- `scripts/agents/kit.d/preview`
- `scripts/agents/deploy-preview.sh`
- `tests/kit-preview.test.ts`

## Done when

- Unit test with a fake `npm`/wrangler on PATH and a temp repo: worktree creation, reuse, version parsing, dry run.
- Sol review saved under the main root `.scratch/reviews/`; landed on `dev` with CI green.

## Done (2026-10-16)

- `kit preview` (`scripts/agents/kit.d/preview`, Node): takes `/tmp/ase-deploy-preview.lock` (flock on an
  inherited fd; prints `waiting for preview lock` when busy, 15 min cap), fetches `origin dev`, creates or
  reuses the detached worktree `<main root>/.scratch/preview-deploy` (compare.mjs-style check: own worktree
  top + `node_modules` symlink; reuse = `checkout -f --detach` + `clean -fd`), removes `dist`, runs
  `npm run deploy:preview` with the log in `<main root>/.scratch/deploy/`, parses the last `Version ID`,
  then checks the live `assets/index-*.js` (cache-busted `?v=`) against `dist/index.html`'s bundle every 5 s
  for up to 2 min. `RESULT: ok preview <version-id> <sha>`; `--dry-run` stops after the worktree.
  Children run in their own process group; INT/TERM/HUP are forwarded and the lock stays held until they
  exit; npm also holds the lock fd so a SIGKILL cannot free it mid-deploy.
- `deploy-preview.sh` is now a thin wrapper: `exec kit preview "$@"`.
- Commits: 20ccfbfd (Sol build), 49c486b0 (review fix, Claude).
- Tests: `tests/kit-preview.test.ts`, 16 tests with fake node/npm/wrangler on PATH, temp repo, temp
  node_modules and a local HTTP server as the live site (help/args, create, reuse + advance, plain folder
  replaced, broken modules link, full deploy with retry, fallback bundle, stale live bundle, hanging server,
  deploy failure tail, missing version/bundle, fetch failure, lock wait, SIGTERM/SIGKILL mid-deploy keep
  the lock, `kit preview` + wrapper). The two signal tests fail on the pre-fix code. `npm run check`,
  `npm run lint` pass.
- Demo: real `kit preview --dry-run` created, then reused, `/home/ubulex/Projects/native-site-editor/.scratch/preview-deploy`
  at be248ef (left in place as the deploy cache). No real deploy was run.
- Review (Sol, evidence `.scratch/reviews/ak-13/20261016T133857Z` and `20261016T134231Z`): fixed 1 (P2: a
  cancelled run released the lock while npm/wrangler kept deploying). Rejected 1: "test with real npm" —
  unit tests must never run real npm (risk of reaching real wrangler); group signal forwarding and npm
  holding the lock fd cover the real npm → sh → wrangler chain.
- Not touched (outside Files): `docs/agents/agent-scripts.md` still describes the old deploy-preview.sh
  (output line and "refuses uncommitted changes").
