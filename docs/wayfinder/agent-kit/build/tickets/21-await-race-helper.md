---
title: "Test helper: switch repo or selection at every await"
type: task (AFK)
status: closed
assignee: ak-21
blocked_by: []
builder: sol
---

## What

- `tests/support/await-race.ts`: wraps a writer's async ports so that, at the Nth await (for every N in turn), the test runs a disturbance (switch repository, switch branch, change selection, new boot) and then asserts the writer wrote nothing stale. Re-runs the scenario once per await point automatically (`forEachAwait(scenario, disturb, assertNoStaleWrite)`).
- Apply it to two or three async writers outside controllers that the media build touched (media upload/import, media rename, Files rename/move), new test files only. If one fails, that is a real defect: report it in Done notes, fix only if small and inside those writers' files (name them in the ticket first), else open a follow-up ticket.
- CODING_STANDARDS.md: widen "Proofs survive awaits" from Controllers to every async writer (a new section "Async writers" or move the rule up), and say tests use `await-race.ts`.

## Files

- tests/support/await-race.ts (new)
- tests/await-race.test.ts (new)
- `CODING_STANDARDS.md`
- tests/<two or three new *-await-race.test.ts files for real async writers>

## Done when

- Helper unit-tested on a toy writer that is wrong (caught) and right (passes).
- Sol review saved under the main root `.scratch/reviews/`; landed on `dev` with CI green.

## Done (2026-10-16)

- Behaviour: `tests/support/await-race.ts` `forEachAwait(scenario, disturb, assertNoStaleWrite)` runs a baseline that counts wrapped port calls, then one fresh replay per await point. In each replay the disturbance runs while the writer is held at that await, even when the port rejects. Failures name the await number and port, and keep the original cause. Zero wrapped awaits fail loudly.
- Writers covered (new test files only): Files adding `createFilesAdding` (5 await points: context, settings, two prepares, save); media draft transaction `mediaDraftTransaction` through `applyMediaWorkspaceBatch`, rename (3) and upload (5). The draft transaction is clean at every await.
- Defect found (kept as a node:test `todo`, not fixed): `createFilesAdding` in `src/page-builder/media-files-adding-runs.ts`. After `await deps.save(...)` resolves it marks the entries `added` and calls `host.announce("Added …")` without re-checking `host.live()`, so a repository or branch switch during the save shows the old repository's success in the new view. **Follow-up for the lead:** this needs a ticket. The fix is a `host.live()` check after the save, going to `drop(addition, …)`; then remove the `todo` in `tests/media-files-adding-runs-await-race.test.ts`. It was not fixed here because ak-17 owns `src/page-builder/media-*` right now.
- CODING_STANDARDS.md: "Proofs survive awaits" now lives in a new "Async writers" section that covers every async writer and names `forEachAwait`. The Controllers bullet points to it.
- Commits: 31163ec0 (Sol build), plus this close.
- Tests: `npm run check` passed; `scripts/agents/unit.sh` passed 3505 with 0 failures (1 todo); `npm run lint` passed. No browser specs were touched.
- Review: one Sol review, clean (no defects, no nits). Saved in `/home/ubulex/Projects/native-site-editor/.scratch/reviews/ak-21/review/`.
