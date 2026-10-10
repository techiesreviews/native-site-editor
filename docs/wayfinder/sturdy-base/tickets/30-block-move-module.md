---
title: "Block move module and its page/template rules (no callers yet)"
type: task (AFK)
status: open
assignee:
blocked_by: [17-guarded-edit-fold-apply-paths]
builder: claude ★
phase: 3
---

## What

Design: /home/ubulex/Projects/native-site-editor/.scratch/sturdy/block-move-design.md (sections 4, 5, 7).

- `src/page-builder/block-move-rules.ts`: the `MoveRules` seam and its two adapters, `pageRules(items)` and `templateRules()`, plus the pure planner. It takes over `native-move-choices.ts` (deleted; `block-insert-controller.ts`, `page-structure-controller.ts` and `main.ts` import from the new file, bodies unchanged) and `templateMovePath`/`templateMoveRefusal` from `block-insert.ts` (196-235). The `name.includes("-")` instance tests (`native-move-choices.ts:41, 51, 72, 85, 89, 110`) use `rules/movable.ts` `isInstance` (no behaviour change: the strict parser already refuses such names).
- `src/page-builder/block-move.ts`: `createBlockMoves({ edits, editing, mounted, forgetOpening })` → `grip(at)` and `move(at, to, options)` as in design section 4: rules picked by `editing()?.path === at.path` (Sections included); `edits.now` when `mounted(path)`, else `pending` through `edits.run` with `openOnlyIfCurrent`, a bytes-still-painted guard and `forgetOpening` on a stale settle; items rule from `r.template`; `select.before`/`after`; today's done/undone strings in one table; `options.stale` for the caller's stale wording; `failed: true` when the editor refuses a planned write.
- `grip` parses `at.painted` once and answers `from`, `inside`, `band`, `refusal(parent, slot)` (index 0, as `fits` today) and `steps`. On a page it applies `rules/movable.ts` (drags only); `move` with `step` keeps the engine's wider reach (body-level header/footer).
- `nativeMoveToEdit` (`native-operations.ts:610-613`) and its re-export (`native-insert.ts:165`) go, with their test cases.
- No caller uses the module yet; main.ts constructs it next to `guardedEdits`.

## Done when

- `tests/block-move.test.ts` on the memory workspace covers design section 7's table (bytes, `node` after incl. `inside`, one undo step with before/after, stale incl. a template behind an items slot and typing outside vs inside a dropped block, refused, stayed, `pending` + `forgetOpening`, `failed`, `grip.steps` at a slot's edge, template Sections on the template rules).
- `tests/native-move-choices.test.ts` and the template cases of `tests/move-anywhere.test.ts` move to `tests/block-move-rules.test.ts` (replace, don't layer), each case on both adapters where it applies.
- `npm run check`, `npm test`, full `native-save` suite green; budget delta reported.
