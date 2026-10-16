---
title: "kit size: boot and byte budget with a delta against origin/dev"
type: task (AFK)
status: closed
assignee: ak-10
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

## Done (2026-10-16)

- `kit size [--no-base] [--base REF]` runs `npm run build:ui` then
  `test:budget -- --no-build` (report-only, port from `port.sh`) for HEAD and the
  base. `build:ui` keeps Vite's config loader out of the shared `node_modules`
  (plain `vite build` hit `EROFS` on `.vite-temp` in the Sol sandbox). The base
  runs in `ensureBase`'s cached detached worktree; a base cache hit never makes one.
- Cache: `<main root>/.scratch/size-cache/<sha>.json` (`version 1`, bytes, `over`).
  A dirty HEAD always measures and never writes. `over` keeps the runner's
  `within`/`OVER` verdict because the table rounds to whole KB.
- Commits: 61148e88 (Sol build, resumed with `agent.sh --resume` after a restart),
  0e7b19d0 (review fix).
- Tests: `tests/kit-size.test.ts` 20 pass (delta format, parsing, cache hit/miss,
  dirty HEAD, `--no-base`, budget edge, OVER at a rounded 355 KB, uncached base
  worktree, signals). `npm run check` and `npm run lint` pass.
- Demo: first run `cache: miss` both sides, `boot 353 KB (±0 KB), total 1440 KB (±0 KB),
  requests 36 (+0), budget 355 KB`, about 40 s; second run `cache: hit` both, 0.6 s.
- Review (Sol, evidence `.scratch/reviews/ak-10/20261016T143551Z`): fixed 1
  (rounded 355 KB passed an OVER build); added both tests it asked for.
