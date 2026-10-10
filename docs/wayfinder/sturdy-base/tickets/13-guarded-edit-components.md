---
title: "Component tools (slot chip, Make component, rename, slot menu, Edit component mode) through the guarded edit"
type: task (AFK)
status: closed
assignee:
blocked_by: [10-guarded-edit-module]
builder: claude ★
phase: 1
---

## What

Design: /home/ubulex/Projects/native-site-editor/.scratch/sturdy/guarded-edit-design.md. `src/page-builder/components.ts` has 46 `deps.revision()` compares (e.g. 437/450, 524/530, 583/586, 636/647, 681-711, 827-833, 910).

- `revision` (`main.ts:681`) is replaced by `edits.stamp()`; Edit component mode's entry (`explicitTemplate`) holds a stamp taken right after it is set, and `entry.stamp.holds()` replaces `explicitTemplate.revision === deps.revision()`.
- `applyChip` (822-870): one plan reading the template and every page through `r` (`slotChangePages` gets a reader). **Gap:** `Object.entries(files).filter(([, text]) => text)` (854) drops empty files from the proof; reads through `r` include them.
- Make component (`main.ts:708` `createComponentFileDrafts`) and new component (`main.ts:4945`): the component files are `creates` of the page edit's plan; `component-draft-transaction.ts` and its companion go (its test cases move to the module suite or the components tests).
- Rename component and the slot menu: plans.

If this is more than a day, split: 13a chip + slot menu + rename, 13b Make component/new component + Edit component mode stamp.

## Done when

- No `deps.revision` left in `components.ts`; `component-draft-transaction.ts` deleted.
- Tests: an empty template that gains content during a slot change refuses (the 854 gap); Make component writes the page and the component files in one undo step; leaving and re-entering Edit component mode during an await refuses.
- `npm run check`, `npm test`, full `native-save` suite green.

## Done (2026-10-10)

- 13a (a658ef70): slot chip, template removal and rename are guarded plans (`src/page-builder/component-plans.ts`) reading every page and template through `r` (the 854 gap closed); the slot menu holds a stamp; `select.historyOnly` in the module. 13b (this commit): Make component, the agent's make_component and New component are one guarded step whose component files (and the slice 103 loader) are `creates`; `component-draft-transaction.ts` and its companion are gone (the agent's first file before a native site, which has no page history, writes through `src/new-drafts.ts`); no `deps.revision` left: Edit component mode's entry holds a stamp, sessions and actions hold stamps.
- Beyond the ticket: guarded creates also check the path's folders against the branch (`branchPathProblem`, as the old companion did); the entry and openings ignore the route shown (opening a template may show a page using it), as the old revision did; harness specs build `edits` from the memory workspace.
- Tests: `tests/component-plans.test.ts` (11: chip, removal, rename, Make component one step + stale stylesheet/new path/component map, loader in the step, New component, mode re-entered during an await), `tests/new-drafts.test.ts` (4, moved), `tests/guarded-edit.test.ts` (+1).

