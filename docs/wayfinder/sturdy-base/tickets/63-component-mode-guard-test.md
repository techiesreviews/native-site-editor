---
title: "Guard test: Edit component mode's state, shares and frame message only in its module"
type: task (AFK)
status: open
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
