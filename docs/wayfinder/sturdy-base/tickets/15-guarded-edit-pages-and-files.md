---
title: "Pages and file operations through the guarded edit, with their missing guards"
type: task (AFK)
status: open
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
