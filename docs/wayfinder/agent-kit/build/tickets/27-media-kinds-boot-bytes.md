---
title: "Media-kind table: keep lazy-only subsets out of the boot bundle"
type: task (AFK)
status: open
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
