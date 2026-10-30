---
title: "A spec file with an `@actual` test still runs its other tests (from agents-and-multiplayer 45)"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [30-kit-repo-and-move]
---

## Goal

On agents-and-multiplayer slice 45 (PR #259) the builder found that the test runner skips the normal tests in any spec file that also holds an `@actual` test (the selection in `scripts/agents/specs-affected.mjs`), so the other pin tests in that file silently stopped running until the eyebrow test moved to its own file. Ticket 59's follow-ups also list two P2s on resuming a build (a Claude build that dies at launch still records a session; switching the builder after a timeout blocks the resume with a misleading message): take them here too.

## Decided behaviour

- Selecting a spec file runs all its tests; `@actual` only adds the tests that need the real browser setup, it never drops the rest.
- Ticket 59's two P2 follow-ups are fixed as their ticket text says.

## Files

- `scripts/agents/specs-affected.mjs` (or wherever it lives after ticket 30), its tests
- `scripts/agents/kit.d/slice`, `tests/kit-slice.test.ts` (ticket 59's follow-ups)

## Done when

- A test: a spec file with one `@actual` test and two normal ones runs all three when selected; fails before the fix.
- Ticket 59's two P2 cases have tests that fail before the fix.
- `kit unit --affected`, `kit doctor`, `kit status` pass.

## Kit commands and evidence

`kit doctor`, `kit slice --ticket <this> --builder claude-opus-5-5`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines.
- Lead, 2026-10-30: also take this here: the `kit ux` reviewer returned no verdict for one feature three times on agents-and-multiplayer slice 14 (F-canvas-13), stopping the slice each time until a rerun. A missing verdict should be retried once by `kit ux` itself, then reported as "no verdict" without stopping the slice.
- Lead, 2026-10-30: also here: a free OpenCode second look that opened a session but never finished ran for 72+ minutes on agents-and-multiplayer slice 15 (the 300 s silence check only covers a session that never starts). Give the second look an overall time limit (about 25 minutes), after which it ends as "skipped (timed out)" and the slice goes on.
