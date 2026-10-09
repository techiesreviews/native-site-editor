---
title: Drift test for the starter's AGENTS.md
type: task (AFK)
status: open
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
