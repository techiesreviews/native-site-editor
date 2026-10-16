---
title: "Media-kind table: keep lazy-only subsets out of the boot bundle"
type: task (AFK)
status: closed
assignee:
blocked_by: [17-media-kinds]
builder: sol
---

## What

Ticket 17 moved every media extension list into `shared/media-kinds.ts`. Boot grew
by about 1,000 gzip bytes (352 → 353 KB of 355) and one request (35 → 36), because
subsets used only by lazily loaded modules now load at start-up with the table.

- Move the lazy-only subsets (and their helpers) into `shared/media-kinds-policies.ts`,
  imported only by the lazy callers. Boot keeps only what boot code uses.
- Behaviour unchanged: `tests/media-kinds.test.ts` and the guard still pass (allow the
  new file as a home in the guard).
- Report boot bytes and request count before/after with `scripts/agents/kit size` if it
  exists on dev, else `npm run test:budget` through `port.sh`.

## Files

- `shared/media-kinds.ts`
- `shared/media-kinds-policies.ts` (new)
- the lazy callers of the moved subsets (list them before editing)
- `tests/media-kinds.test.ts`, `tests/media-kinds-guard.test.ts`

## Done when

- Boot bytes back to about 352 KB (≥ 600 bytes saved) or the reason it can't be.
- Sol review saved under the main root `.scratch/reviews/`; landed on `dev` with CI green.

## Done (2026-10-16)

- **Behaviour.** The lazy-only subsets and their helpers moved from
  `shared/media-kinds.ts` to `shared/media-kinds-policies.ts`; the 27 lazy callers
  import from it, boot code keeps the core table. No behaviour change; the guard
  allows the new file as a home.
- **Numbers** (`npm run test:budget` through `port.sh`, report-only, cold median of 3;
  base = origin/dev 488ccdf9 in a detached worktree): boot before first paint
  353 KB → 352 KB gzip; requests before paint 36 → 36; total 1,440 → 1,441 KB
  (the new lazy chunk). Boot `media-kinds` chunk 1.43 → 0.66 kB gzip (about 760 B
  saved, ≥ 600 target); the moved lists ship in a 1.05 kB lazy
  `media-kinds-policies` chunk. The request count does not fall back to 35: boot
  code still needs the core table, so its chunk still loads at start-up.
- **Commits.** 5a45106f split (Sol build), cb39200a review fix: test that the boot
  import graph never reaches `media-kinds-policies`.
- **Tests.** `tests/media-kinds.test.ts` (transitive boot-import test added),
  `tests/media-kinds-guard.test.ts`. `npm run check`, `npm run lint` and 3,876 unit
  tests passed.
- **Review.** Sol, `.scratch/reviews/ak-27/20261016T132715Z`: no defects, two gaps
  (missing after-measurement; transitive-import test) — both closed. Re-review
  `20261016T141909Z`: no defects, no gaps.
