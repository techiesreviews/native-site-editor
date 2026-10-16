---
title: "Check: no exports without production callers"
type: task (AFK)
status: open
assignee:
blocked_by: [17-media-kinds, 18-promise-lint, 19-colour-check, 27-media-kinds-boot-bytes]
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

## Findings (2026-10-16, before any removal)

- Literal rule (every export no other production module imports): **804** on origin/dev 1246506
  (src 673, shared 73, worker 58). Rough split: ~670 are used inside their own module (export kept
  for a unit test or simply unneeded), ~78 only by tests, ~56 nowhere. 61 of the 804 are one
  `export * from "./source-editor"` line in src/components/code-editor.ts, counted per name.
- Rule adopted (ak-20, from the ticket's "dead code with only test callers"): an export fails
  when no production code uses it, its own module included; tests never count; `export *` is
  judged at the declaration. Count under that rule: see Done notes.
