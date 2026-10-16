---
title: "kit shots --compare uses today's tooling against the old app"
type: task (AFK)
status: open
assignee:
blocked_by: [08-kit-shots-compare, 30-shots-print-findings]
builder: sol
---

## What

`kit shots --compare <ref>` runs the base worktree's own `kit shots`, so it fails for any
ref older than ticket 06 ("Ref 0a69178a predates kit shots") and silently uses outdated
scenarios, layout checks and outputs for refs between tickets 06 and now. The lead had to
overlay today's tooling by hand for the proof shots (ticket 25).

- Run the base capture with the **current** checkout's tooling (`scripts/agents/kit*`,
  `scripts/agents/shots/`, `tests/support/scenarios.ts`, port helpers) while serving the
  **base** app code: either point the shots config's server at the base worktree's app
  root, or overlay the current tooling files into the base worktree (untracked) before
  capturing. Pick whichever keeps the base worktree reusable and the cache correct.
- The cache key includes the tooling version (hash of those files), so a tooling change
  re-shoots the base.
- Clear error only when the base app cannot serve at all.

## Files

- `scripts/agents/shots/compare.mjs`
- `scripts/agents/shots/config.ts` (server root override, if that route is chosen)
- `tests/kit-shots-compare.test.ts`

## Done when

- `kit shots media-gallery --width 390 --compare 0a69178a` produces before/after pairs.
- Sol review saved under the main root `.scratch/reviews/`; landed on `dev` with CI green.
