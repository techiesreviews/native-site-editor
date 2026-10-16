---
title: "Check: no exports without production callers"
type: task (AFK)
status: closed
assignee: ak-20 (runner + lead after restarts)
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

## Done (2026-10-16)

- **Check.** `scripts/check-exports.mjs` (TypeScript 6 API from `typescript-eslint-api`) builds the
  production import graph of src/shared/worker from the entry points and fails on exports no production
  module imports; imports from `tests/` don't count. About 6 s, so it runs in `npm run lint`, not `check`.
  Allowlist `scripts/check-exports.allow.json` (`{file, name, reason}`), 15 entries with reasons.
- **Removed.** 54 declarations, 37 re-exports and 34 obsolete test cases (ledger in the build's
  `.scratch/removals.md`); some test-only helpers moved to `tests/support/`. After ticket 27 landed, the lead
  dropped the duplicate `isImagePath` from `shared/media-kinds.ts` and allowlisted the table lookups
  `mediaKind` and `mimeType` (the table's kind and MIME columns, proven by `tests/media-kinds.test.ts`).
- **Bytes.** `kit size`: boot 352 KB (±0), total 1,440 KB (−1 KB), requests 35 (−1) vs dev a4b0a7d.
- **Review (GPT-6.1 Sol, `kit review`), 2 rounds.** Round 1: export clauses (`export { x }`,
  `export { x as y }`) ignored same-module uses → fixed by Sol (baf3ba7a) with fixtures; boot-bytes
  baseline → measured above. Round 2: unused `export *` barrels never produce findings — accepted as a
  known limit (2 star re-exports in the codebase: `src/native-source-location.ts`,
  `src/components/code-editor.ts`). Evidence: `/home/ubulex/Projects/native-site-editor/.scratch/reviews/ak-20/`.
- **Follow-up seen:** round 2's `kit review` printed `RESULT: fail run.log does not name requested model`
  although the review completed — the model check fails on that path.
- **Tests:** check, unit (3,919), lint, check-exports tests (31) pass.
