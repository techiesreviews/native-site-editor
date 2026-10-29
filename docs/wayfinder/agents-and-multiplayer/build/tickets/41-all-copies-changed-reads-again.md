---
title: "An all-copies edit whose copies all changed is told to read again (follow-up on 40)"
type: task (AFK)
status: open
assignee: am-41
builder: claude
blocked_by: [40-exact-part-edits-second-look-fixes]
---

## Goal

Slice 40's final review left a P2 ([ticket 40 Follow-ups](40-exact-part-edits-second-look-fixes.md#follow-ups)): in `shared/agent-edit.ts` (about line 166) an `all` edit whose read had several copies, all of which have since changed (`was.length > 1`, `is.length === 0`), still gets `{ index, at: was[0] }` with no `recounted`, so `editClash` (about lines 188–204) offers a retry built around the first copy only. An agent that follows it changes one copy and leaves the others wrong, with no warning. Same kind of fault as ticket 40's item 2.

## Decided behaviour

- A clash offers the current part to retry from only when the read had exactly one copy; any `all` edit whose copy count changed, including down to zero, is told to read the page again (`recounted`).
- Also take ticket 40's three test gaps if they are small.

## Files

- `shared/agent-edit.ts` and its unit tests (`tests/agent-edit*.test.ts` or `tests/agent-tools-edit.test.ts`)

## Done when

- A unit test: `all` edit, read had two copies, both changed since → the reply says read again and carries no part; fails before the fix.
- Ticket 40's single-copy and still-there cases keep their answers.
- `kit unit --affected`, `kit specs --affected` (RESULT quoted), `kit doctor` pass.

## Kit commands and evidence

`kit doctor`, `kit slice --ticket <this> --builder claude-opus-5-5`, `kit unit --affected`, `kit specs --affected`, `kit review`, `kit pr`; report the RESULT lines.
