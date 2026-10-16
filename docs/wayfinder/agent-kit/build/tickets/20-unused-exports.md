---
title: "Check: no exports without production callers"
type: task (AFK)
status: open
assignee:
blocked_by: [17-media-kinds, 18-promise-lint, 19-colour-check]
builder: sol
---

## What

- `scripts/check-exports.mjs`: builds the import graph of src/shared/worker (TypeScript 6 API from `typescript-eslint-api`, or a careful regex scan if the API is too slow) and fails on exported names that no production module imports. Imports from `tests/` do not count as production use (retro: dead code with only test callers), except exports listed in the allowlist with a reason (test seams that are deliberate).
- Entry points (main.ts, worker entry, workers, vite config inputs) are roots.
- Remove the dead code found, with its now-orphaned tests; list removals in the Done notes.
- Runs in `npm run check` if under ~3 s; otherwise in `npm run lint`.

## Files

- scripts/check-exports.mjs (new)
- scripts/check-exports.allow.json (new)
- package.json (the `check` script only)
- src/**, shared/**, worker/** files with dead exports
- `tests/check-exports.test.ts`

## Done when

- check/lint pass; boot bytes unchanged or smaller.
- Sol review saved under the main root `.scratch/reviews/`; landed on `dev` with CI green.
