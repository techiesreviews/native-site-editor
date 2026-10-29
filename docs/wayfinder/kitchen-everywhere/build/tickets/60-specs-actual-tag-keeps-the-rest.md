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
