---
title: "kit size: boot and byte budget with a delta against origin/dev"
type: task (AFK)
status: open
assignee:
blocked_by: [01-kit-front-door]
builder: sol
---

## What

- Follow the kit layout in [the map](../../map.md#notes): one executable in `scripts/agents/kit.d/`, a `# kit: <summary>` line, `--help`, Node 24 and owner from `kit-lib`, one final `RESULT:` line, own test file.
- Runs `npm run test:budget` through `port.sh` for HEAD and for `origin/dev` (base built in a cached detached worktree like ticket 08's, keyed by sha; results cached as JSON per commit under the main root `.scratch/size-cache/`), prints `boot <now> KB (<±delta>), total <now> (<±delta>), budget 355 KB`.
- `--no-base` skips the base. Exit 1 when over budget.

## Files

- `scripts/agents/kit.d/size`
- `tests/kit-size.test.ts`

## Done when

- Unit tests: delta formatting, cache hit/miss (fake budget runner). One demo run.
- Sol review saved under the main root `.scratch/reviews/`; landed on `dev` with CI green.
