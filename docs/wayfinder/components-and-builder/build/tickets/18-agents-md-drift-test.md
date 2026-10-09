---
title: Drift test for the starter's AGENTS.md
type: task (AFK)
status: closed
assignee:
blocked_by: [17-starter-agents-components-chapter, 70-chapter-fixes-after-starter]
builder: sol
phase: 2
---

## What

Ticket [05](../../tickets/05-what-agents-are-told.md) §2.

- Refresh `fixtures/actual-starter` from slice 17's commit on the starter's `dev` branch (`git archive <sha> | tar -x`, provenance in `fixtures/actual-starter.README.md`). `fixtures/native-starter` stays frozen.
- A unit test fails when `fixtures/actual-starter/AGENTS.md`'s Components chapter differs from the conventions' chapter.
- It replaces the weak pattern check in `tests/mcp-runtime.test.ts:100-108`.

## Done when

- The drift test passes, and fails when either copy is changed alone.
- The tests that use `fixtures/actual-starter` (grep for it) still pass.

## Done (2026-10-09)

- `fixtures/actual-starter` is now the starter's `dev` at `675eeac` (slice 70's commit, after slice 17's `11574fc`, since the drift test needs the corrected chapter); `fixtures/actual-starter.README.md` gives the provenance, the refresh commands and what uses the fixture.
- New `tests/agents-md-drift.test.ts`: the fixture's `AGENTS.md` Components chapter must equal `componentsChapter(siteConventions)` (checked failing with either copy edited alone). In `tests/mcp-runtime.test.ts` the chapter spot checks went; the skip-link and add_section sentences joined the chapter rule list.
- `npm run check`, `npm test` (1116) and the `@actual` browser group (21) pass on the refreshed fixture. Commit "Drift test for the starter's AGENTS.md; actual-starter at 675eeac (slice 18)".
