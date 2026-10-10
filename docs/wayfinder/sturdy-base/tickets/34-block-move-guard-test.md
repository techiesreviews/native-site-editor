---
title: "Guard test: one move engine, one page/template choice"
type: task (AFK)
status: open
assignee:
blocked_by: [31-block-move-keys-bar-structure, 32-block-move-drags, 33-block-move-mcp-and-dead-card-moves]
builder: sol
phase: 3
---

## What

Design: /home/ubulex/Projects/native-site-editor/.scratch/sturdy/block-move-design.md (section 7). A unit test (TypeScript compiler API, as slice 18's) that fails when:

- a file other than `src/page-builder/block-move-rules.ts` calls `nativeMoveEdit`, `nativeElementMovePlan`, `nativeElementKeyMove` or `templateKeyMove`;
- a file other than `src/page-builder/block-move.ts` passes a plan to `edits.run`/`edits.now` that moves an element (calls any of the above), or chooses page vs template rules for a move from `editModeTemplate()`.

## Done when

- `tests/block-move-guard.test.ts` green on dev, with a deliberately broken fixture showing each rule fires.
- `npm run check`, `npm test` green.
