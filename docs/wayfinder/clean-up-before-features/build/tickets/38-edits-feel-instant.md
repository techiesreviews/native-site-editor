---
title: "Editing feels instant again: no pause after a change or on Undo"
type: task (AFK)
status: open
assignee: lead-38 (this session)
builder: claude
blocked_by: []
---

## Goal

Lex's end check of the clean-up (2026-10-25, [feedback](../feedback.md)): "After a change, the editor pauses before I can continue editing; making changes feels delayed overall" and "Undo feels slow". Find the cause by measuring, then fix it. Use the `diagnosing-bugs` loop: reproduce, measure, find the cause, fix, measure again.

## Decided behaviour

- Typing, a block move, a drop, a Page Structure edit and Undo/Redo answer at once: the next keystroke or click is never held up by the save, the preview repaint, the agent context update, the text index or a session check after the previous change.
- Nothing else changes in what Lex sees.

## How to find it

- Measure in a real browser on the fake GitHub server (`tests/native-save/`): the time from a change (type a word in a heading, move a block, Undo) until the page takes the next input, and the main-thread long tasks in between (Performance API `longtask` entries, or a Playwright trace). Measure `origin/dev` and the last production commit (`origin/main`) the same way, so the report says whether the clean-up made it slower and by how much.
- Likely suspects to check, not to assume: work done synchronously after every change (draft store writes, agent context / `workingPart` updates from slice 52, the overlay rebuild from slices 30–32, the text index, `updateNativePreviewSources`, full preview repaints, guard re-checks from slices 21–23 and 27), and Undo waiting on a save or a reload.

## Files

Where the cause is; a browser spec that measures change-to-next-input and Undo (`tests/native-save/native-edit-latency.spec.ts`, new) with a budget.

## Done when

- The report gives before/after numbers for each measured action on dev and on main, the cause(s) with file and line, and the fix.
- After the fix: each measured action takes the next input within 100 ms on the spec's machine and has no main-thread task over 50 ms after the change (or the Done section says which one cannot and why).
- The new spec guards it; `npm run check`, `npm test`, `kit specs --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)).

- `kit doctor`; `kit bg slice-38 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/38-edits-feel-instant.md --builder claude-opus-5-5`; `kit wait job slice-38 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected`, `kit size` (at or under 362 KB), `kit ux --ticket <this ticket>` for the visible change.
- Review: `ASE_REVIEW_MODEL=claude-opus-5-5`. Land: `kit pr --ticket <this ticket>`.
