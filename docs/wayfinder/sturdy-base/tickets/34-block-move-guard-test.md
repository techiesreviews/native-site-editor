---
title: "Guard test: one move engine, one page/template choice"
type: task (AFK)
status: closed
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

## Done (2026-10-11)

- `tests/block-move-guard.test.ts` (TypeScript parser via `typescript-eslint-api`, per-file checker as `guarded-edit-reads.test.ts`): `move-engine` (only `block-move-rules.ts` refers to `nativeMoveEdit`/`nativeElementMovePlan`/`nativeElementKeyMove`/`templateKeyMove`: calls, aliases, renamed imports, re-exports, member and string access), `move-plan` (outside `block-move.ts`, no plan passed to `edits.run`/`edits.now` refers to a move name — the engine plus sibling/depth moves, template path/refusal, `nativeMoveRefusal`, `nativeMoveDestinationValid`, `pageRules`, `templateRules` — directly, through same-file helpers, aliases or values made from one), `template-choice` (outside `block-move.ts`, no function or module-level code both reads `editModeTemplate` — directly, destructured, through a same-file reader or a value made from one — and refers to a move name). All three allowlists empty; on the sources before slice 30 the rules flag main.ts (`dragPageBlock`'s branch), page-structure-controller's `sectionMovePlan` and block-insert-controller's move plans.
- `src/native-insert.ts` no longer re-exports `nativeMoveEdit` (no importer).
- Built by Sol; tests: 8 (broken fixtures and near-misses per rule, real tree, exact-count allowlist self-test). Unit 1,915/1,915.
