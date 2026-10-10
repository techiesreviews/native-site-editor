---
title: "MCP move_section through the Block move module; the dead card Move buttons and swapEdits go"
type: task (AFK)
status: open
assignee:
blocked_by: [31-block-move-keys-bar-structure]
builder: sol
phase: 3
---

## What

Design: /home/ubulex/Projects/native-site-editor/.scratch/sturdy/block-move-design.md (sections 2.1 row 4 and the dead row, 6).

- `agent-site.ts` `move_section` (522-531): `actions.moveSection` is `moves.move(section, { gap: { parent, index }, section: true })`; the reply's section id comes from the outcome's `node` (the hand index math at 526-527 goes); "The section is already there." on `stayed` as today.
- `page-structure-controller.ts` `moveNativeSectionTo` (772-788) and `main.ts` 1720-1722 go; `main.ts:4936` points at the module.
- Dead code: `cards.ts` `move` (486-506) and its Move controls (554-555), `withoutCardMoves` and `MOVE_ICONS` (`cards-controller.ts:12-18, 38`): the edit bar never shows them. `swapEdits` (`native-structure.ts:86-93`) and its test (`native-structure.test.ts:73-75`) go.
- Behaviour, if the lead agrees (B3): Undo of an agent's section move reselects it where it was.

## Done when

- `grep -n "swapEdits\\|moveNativeSectionTo\\|withoutCardMoves" src tests` finds nothing.
- `agent-site.test.ts` keeps one `move_section` case (new id; stayed); `cards-controller.test.ts` loses its Move cases.
- `native-cards`, `native-page-sections` and `native-mcp` specs green; `npm run check`, `npm test`, full `native-save` suite green.
