---
title: "Guard test: Edit component mode's state, shares and frame message only in its module"
type: task (AFK)
status: closed
assignee:
blocked_by: [62-component-mode-callers]
builder: sol
phase: 6
---

## What

Design: /home/ubulex/Projects/native-site-editor/.scratch/sturdy/edit-component-mode-design.md (section 8, last item). A unit test (TypeScript compiler API with a type checker, as slice 18's) that fails when:

- a file other than `src/page-builder/component-mode.ts` calls `drillChain` or `backChain`;
- `ComponentDeps.shareHistory` or the preview's `editComponent` (taking an `EditComponentFrameMode`) is called anywhere but in the object passed to `createComponentMode` (resolved by symbol: the guarded edit's `EditorWorkspace.shareHistory`, guarded-edit/commit.ts and main.ts's workspace, is not flagged);
- a `JSON.stringify` of a mode (`.now()`, `.active()`) is compared;
- a mutable binding (module-level `let`, or a `let` captured inside `createComponentTools`) has a type holding a `Stamp`, an opening object or a share release.

## Done when

- `tests/component-mode-guard.test.ts` green on dev, with a passing and a deliberately failing fixture for each rule.
- `npm run check`, `npm test`, full `native-save` suite green.

## Done (2026-10-11)

- `tests/component-mode-guard.test.ts` (TS 6 parser, per-file checker, as the block move and card tree guards): `drillChain`/`backChain` named outside component-mode.ts; `ComponentDeps.shareHistory` or the preview's `editComponent` (EditComponentFrameMode) called outside the object passed to component-mode's own `createComponentMode` (imported by name or namespace; `EditorWorkspace.shareHistory` not flagged); a compared `JSON.stringify` of `mode.now()`/`active()` (aliases followed); a module-level `let`, or a `let` captured inside `createComponentTools`, holding a `Stamp`, an opening/entry or a share release (annotations, initialisers, holder fields). A failing and a near-miss fixture per rule; allowlist empty; src/ clean.
- Added by the lead (found in 62's M3): Page Structure kept folds and the selected row by node index, so after Undo past the mode's first step another section showed unfolded; the same drift followed any Undo/Redo adding or removing a row above. `followRows` (src/components/structure-follow.ts) carries folds and the selection to the same elements; a selection the frame reports before its structure waits for that paint; a template element with no rows marks its instance's row.
- Commits: "Guard test: …" (Sol), "Page Structure: folds and the selected row follow …", "Page Structure follow: a gap's rows pair by their own text, then by kind" (native-move-keys), two review-fix commits (Sol's two reviews). Tests: guard (6 cases), `structure-follow.test.ts` (6), `native-edit-component-leave-actual` M3 assertions and a plain Undo/Redo case. `npm test` 2025 passed; full `native-save` 888 passed, 60 skipped (group-tagged); smoke 42; `@actual` 58.
