---
title: "kit shots --compare dev: before/after pairs from origin/dev"
type: task (AFK)
status: closed
assignee: ak-08
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

## Done (2026-10-16)

- **Behavior.** `kit shots <screen...>|--steps file --compare <ref>` resolves the
  ref (`origin/<ref>` when it exists), sets up or reuses a detached worktree at
  `<main root>/.scratch/shots-base/<sha>/` (shared `node_modules` and
  native-static links like worktree.sh), runs that worktree's own `kit shots`
  for missing before shots with the same real starter, then the current
  checkout's `kit shots` into the same folder, so the contact sheet pairs
  before | after rows. Base shots are cached per (sha, screen, steps, width,
  theme) in `<base>/.scratch/kit-shots-cache/`; base worktrees prune to the
  newest 3. One final `RESULT:` line; child RESULT lines are dropped.
  `kit.d/shots` routes `--compare` to `compare.mjs` and adds a help section.
- **Commits.** 323942dd (Sol build), 7f148c6d (hide deleted run paths),
  222c88c6 (lease fix), 1f94252d (cache publish fix).
- **Tests.** `tests/kit-shots-compare.test.ts` (11 tests: ref split, cache key,
  cache reuse and damage, prune, worktree create/reuse/repair/prune, leases,
  concurrent setup, concurrent cache publish, pairing, fake end-to-end compare,
  wrapper help and errors). `npm run check`, `npm run lint`, unit.sh on the two
  shots test files: 18/18 pass.
- **Demo.** `kit shots media-gallery --width 390 --compare dev` cold run: base 0
  cached, 2 shot, after ok; contact sheet shows paired before | after rows for
  light and dark. origin/dev moved between runs, so the cache hit was proven
  pinned to the cached sha: base 2 cached, 0 shot, after ok (one server only).
  Folder: `/home/ubulex/Projects/native-site-editor/.scratch/shots/ak-08/compare-demo/`.
- **Review.** Sol review 1 (`.scratch/reviews/ak-08/20261016T125253Z`): P2
  pruning could remove a base still in use, fixed with per-run leases (pid
  files; dead owners ignored). Re-review (`20261016T125554Z`): P2 concurrent
  cache publish could delete a just-finished entry, fixed by publishing under a
  lock and never replacing a complete entry; no further re-review (one allowed).
  Rejected: none.
