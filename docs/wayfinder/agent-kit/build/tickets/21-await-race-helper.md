---
title: "Test helper: switch repo or selection at every await"
type: task (AFK)
status: open
assignee:
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
