---
title: "Component tools (slot chip, Make component, rename, slot menu, Edit component mode) through the guarded edit"
type: task (AFK)
status: open
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
