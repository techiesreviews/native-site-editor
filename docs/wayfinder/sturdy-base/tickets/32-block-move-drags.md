---
title: "Block drags (canvas, edit bar name, Page Structure rows) through the Block move module"
type: task (AFK)
status: closed
assignee:
blocked_by: [30-block-move-module]
builder: sol
phase: 3
---

## What

Design: /home/ubulex/Projects/native-site-editor/.scratch/sturdy/block-move-design.md (sections 2.1 rows 1a-1c, 5, 6).

- `main.ts` `dragPageBlock` (923-958): `grip(at)` at the press gives `from`, `inside`, `band` and `fits` (`grip.refusal`, one parse per drag instead of one per hovered container); the `template ? … : …` branches (925-952) go; the drop calls `moves.move(at, { drop, painted, name, where }, { since })` and shows a refusal at the pointer as today. Geometry (`drop-target.ts`, `tree-drop.ts`, `section-snap.ts`, `block-drag*.ts`) does not change; `dropStays` stays the hover hint.
- `block-insert-controller.ts`: `move` (136-161) goes; the controller keeps `insert`, `click`, `drop`.
- Behaviour, if the lead agrees (B6): a Page Structure row press on a Block `grip` refuses starts no drag.

## Done when

- No `templateMoveRefusal`, `templateMovePath` or `nativeMoveRefusal` call left in `main.ts`; `block-insert-controller.test.ts` keeps its insert/click/drop cases and its move cases go (the module suite has them, incl. typing inside the dragged block).
- `native-block-drag`, `native-block-move`, `native-section-drag`, `native-structure-drag`, `native-move-anywhere(-actual)`, `native-drop-containers` specs green; `npm run check`, `npm test`, full `native-save` suite green; budget delta reported.

## Done (2026-10-11)

- `dragPageBlock` (canvas, bar name, Page Structure rows) asks `blockMoves.grip` at the press (`from`, `band`, `fits` from `grip.refusal`) and drops through `blockMoves.move(at, { drop, painted, name, where })`; its `template ? … : …` branches and the `templateMovePath`/`templateMoveRefusal`/`nativeMoveRefusal` calls are gone from main.ts, and so is the block-insert controller's `move` (it keeps insert, click, drop). B6 built: a press (row, canvas, bar) on a Block `grip` refuses or `drags` false starts no drag; a press whose bytes were not painted yet starts none either (before: a drag that refused everywhere). B3 for drags as before (Undo selects the part pressed).
- Commits 04f12102 (Sol), 6fc21aa1, c86ef5ce (Sol review: the B6 spec drags a sibling first so the absence check is not early).
- Tests: the controller's move cases go; `block-move.test.ts` gains a drop behind an edited items-slot template, a template drop beside its element, a link dropped into a paragraph and a route change after the press; `native-structure-drag.spec.ts` gains the B6 case (an `<svg>` row; fails on the old code). Unit 1,900/1,900; full native-save 887 passed, 0 failed, 56 skipped; smoke 42/42; @actual 54/54. Entry chunk +7.3 KB raw / +2.3 KB gzip (block-insert.ts and native-elements.ts, before a separate chunk the entry imported statically, now merged into it); entry plus its static imports -41 B raw / -0.3 KB gzip; block-insert controller chunk -1.1 KB raw / -0.3 KB gzip.
