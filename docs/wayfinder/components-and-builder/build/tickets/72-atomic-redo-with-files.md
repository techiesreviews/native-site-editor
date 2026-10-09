---
title: "Undo and redo of steps that create files are all or nothing"
type: task (AFK)
status: closed
assignee:
blocked_by: []
builder: claude ★
phase: 3
---

## What

Found by slice 27 (see its Done note): redo puts the page edit back at once and re-creates the component's files afterwards; if re-creating them fails (e.g. a file now exists at that path) the instance is back without its files. Make component (slices 10, 64) has the same shape. Make every history step that creates or deletes files alongside a page edit all or nothing on undo and redo, using the history mechanism that already lets a redo wait and refuse: check the files can be written before applying the page edit, and refuse the redo with a reason otherwise. Covers + New component, Make component (incl. card files and copied CSS) and the placeholder image (slice 30).

## Done when

- Unit tests for the refusal; a nightly browser test: create a component, undo, create a conflicting file at the path, redo → refused with a reason and nothing half-applied; plain redo still works.

## Done (2026-10-09)

- A history companion (`HistoryCompanion` in `src/draft-store.ts`) can refuse: `ready(direction)` is asked before an edit step moves, while Undo and Redo wait (the branch lookup), and `undo`/`redo` run before the step's text and may return a reason, taking back the companions that ran; the step stays where it is. New component and Make component (card files and copied CSS) pass their files' companion (`receipt.companion`, `component-draft-transaction.ts`): Redo checks every path before the page moves ("… already exists."), Undo refuses while a made file changed since or is open (`draftOpen` in `source-editor.ts`) and puts back what it took if a drop fails. A card's new page refuses Redo when a file is at its path; an operation's Redo of a created file there again (the placeholder image) says "<path> already exists.".
- Commits "Undo and Redo of steps that create files are all or nothing" (5b9083f) and two review-fix commits on `dev`.
- Tests: `tests/draft-store.test.ts` (ready refusal and waiting, history changed while asked, a refusing companion taken back), `tests/component-draft-transaction.test.ts` (Redo refusals incl. a draft arriving after the lookup, Undo refusals, failed drops), `tests/native-operation-history.test.ts` (created file there again); nightly `native-new-component.spec.ts` "Redo of New component refuses whole…".
