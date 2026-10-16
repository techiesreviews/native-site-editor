---
title: "kit shots --compare dev: before/after pairs from origin/dev"
type: task (AFK)
status: open
assignee:
blocked_by: [06-kit-shots-core]
builder: sol
---

## What

- `--compare dev` (or any ref): shoots the same screens/steps from `origin/dev` in a cached temp worktree `/home/ubulex/Projects/native-site-editor/.scratch/shots-base/<sha>/` (created with `git worktree add --detach`, shared `node_modules` symlink like worktree.sh, reused while the sha matches, older ones pruned to the last 3), then the current worktree; pairs rows in the contact sheet as before | after.
- Base shots are cached per (sha, screen, steps, width, theme); a second run reuses them.

## Files

- `scripts/agents/shots/compare.mjs`
- `scripts/agents/kit.d/shots`
- `tests/kit-shots-compare.test.ts`

## Done when

- Unit tests: cache keying and reuse, prune, pairing. Demo run with `--compare dev` on one screen.
- Sol review saved under the main root `.scratch/reviews/`; landed on `dev` with CI green.
