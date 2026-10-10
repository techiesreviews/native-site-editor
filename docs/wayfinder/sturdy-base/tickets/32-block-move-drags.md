---
title: "Block drags (canvas, edit bar name, Page Structure rows) through the Block move module"
type: task (AFK)
status: open
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
