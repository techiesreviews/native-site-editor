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

- `tests/block-move-guard.test.ts` (TypeScript parser via `typescript-eslint-api`, one checker per file as `guarded-edit-reads.test.ts`; same-file aliases, renamed imports, destructured names, values made from a name and functions whose bodies refer to one are followed transitively). `move-engine`: only `block-move-rules.ts` refers to `nativeMoveEdit`/`nativeElementMovePlan`/`nativeElementKeyMove`/`templateKeyMove` (calls, aliases, imports, re-exports, member and literal access). `move-plan`: outside `block-move.ts`, no plan passed to `edits.run`/`edits.now` (queues and methods aliased, destructured or bound too) reaches a plan-making name (the engine, sibling/depth moves, `pageRules`, `templateRules`). `template-choice`: outside `block-move.ts`, no function (with its closures) or module-level code both reaches `editModeTemplate` and a move rule (those plus template path/refusal, `nativeMoveRefusal`, `nativeMoveDestinationValid`). All three allowlists empty; on the sources before slice 30 each rule fires (main.ts, page-structure-controller, block-insert-controller).
- `src/native-insert.ts` no longer re-exports `nativeMoveEdit` (no importer).
- Commits 70446358 (Sol), b3bd6d04 and 46ccae90 (Sol review fixes (template-literal access, aliased and destructured edit queues, helper-made and destructured rules, parameter defaults, imports are not choices, refusals in a plan are not moves; re-reviewed). 8 tests (broken fixtures and near-misses per rule, real tree, exact-count allowlist self-test). Unit 1,915/1,915; smoke 42/42.
