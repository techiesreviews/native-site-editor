---
title: "kit preview keeps the last seen bundle when the deadline cuts a poll short"
type: task (AFK)
status: closed
assignee: ak-42 (lead)
blocked_by: []
builder: claude
---

## What

`tests/kit-preview.test.ts` "an old live bundle fails within the verification deadline" kept failing
inside the full unit suite (ticket 37 only widened its deadline): its RESULT line said
`live unreachable` instead of `live index-old.js`. Cause, in `kit preview`'s verification loop: when
the last poll was still in flight at the deadline, the timeout abort set `live` to "unreachable",
discarding the bundle earlier answers had named. Real runs could misreport the same way.

## Files

- `scripts/agents/kit.d/preview`
- `tests/kit-preview.test.ts`

## Done when

- A poll aborted by the deadline keeps the last named bundle; other failures still read "unreachable".
- Sol review on the PR; merged into `dev` through `kit pr`.

## Done (2026-10-17)

- `verify()` only resets `live` to "unreachable" for failures other than the deadline timeout.
- New test: first answer names `index-old.js`, the second hangs until the deadline → RESULT names
  `index-old.js` (fails on the old code, passes now). The never-answering case still says unreachable.
  `tests/kit-preview.test.ts` 17/17.
