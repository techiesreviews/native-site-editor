---
title: "Pages and file operations through the guarded edit, with their missing guards"
type: task (AFK)
status: closed
assignee:
blocked_by: [10-guarded-edit-module]
builder: sol
phase: 1
---

## What

Design: /home/ubulex/Projects/native-site-editor/.scratch/sturdy/guarded-edit-design.md. Four gaps found in the map, fixed by making each a plan:

- **`applyFileOperation`** (`main.ts:4435-4484`, renames/moves/deletes from the Files tab) has no proof and its undo has none either: it becomes a plan with `moves`/`deletes` (one undo step through the module).
- **`moveFileTarget`** (`file-operations-controller.ts:187-199`): the link-note `confirmDialog().ask()` (193) awaits without a pin; the stamp is taken before the dialog and passed as `since`.
- **`duplicateFileTarget`** (463) has no epoch guard: plan with `since`.
- **`writeNativePageMeta`** (`main.ts:1812`) direct path has no epoch check: plan.
- Pages controller proofs (`pages-controller.ts:127-134`, 144-148, 193-197, 217, 254), page settings (`main.ts:1868-1925`), site settings (1976-1992), create page (3666-3667), `changeNativeUrl`, `nativeAssetSnapshot` (file-ops 224-225): plans whose reads replace the hand-built `expectedSources` maps.

## Done when

- Tests on the memory workspace: a Files-tab rename after a branch switch refuses; Undo of a rename after the file was edited refuses; the move dialog answered after the file changed refuses; duplicate after a repository switch refuses.
- No `expectedSources` built by hand in `pages-controller.ts` or `file-operations-controller.ts`.
- `npm run check`, `npm test`, full `native-save` suite green.

## Done (2026-10-10)

- Files-tab rename/move/delete, Pages-tab delete/Move to/URL change/new page/folder page/duplicate, page meta (`now` with a typing group on the open page) and page/site settings are each one `edits.run`; dialogs and the Move to picker run inside the plan, so the link-note `ask()` is proved. Index waits come first, with the stamp, file list and target drafts as the `guard`, so a change while the index loads refuses before any dialog. Duplicate holds a stamp. Plain repositories rename/delete through the module (one undo step with a receipt; needs an open file); `applyFileOperation` and its unproved undo are gone. Branch `_redirects` is cached as a base source so plans read it through `r`.
- Open-page settings now take the editor's range path (one Monaco step), as block inserts do since slice 11; `native-operation-history.spec.ts`'s save-listener case moved to another page's settings (the receipt path).
- Tests: `tests/file-operations-controller.test.ts` and `tests/pages-controller.test.ts` on the memory workspace (rename after a branch switch, undo after an edit, dialogs answered after a change, duplicate after a switch, index-time edits refuse before dialogs).

