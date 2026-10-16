---
title: "kit preview: deploy the preview from its own temp worktree"
type: task (AFK)
status: open
assignee:
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
