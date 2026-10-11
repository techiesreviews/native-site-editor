---
title: "MCP move_section through the Block move module; the dead card Move buttons and swapEdits go"
type: task (AFK)
status: closed
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

## Done (2026-10-11)

- MCP `move_section` moves through `createBlockMoves` (`{ gap, section: true }`; the agent action takes the proved bytes as `painted`): the reply's id is the outcome's `node` (hand index math gone), "The section is already there." on `stayed`, stale and plan refusals are conflicts, an editor refusal an error; Undo of an agent's move reselects the section where it was (B3). Gone: `moveNativeSectionTo` (controller, main.ts pass-through, `moveSectionTo`), `nativeSectionMovePlan`, the cards' `move` and Move controls, `withoutCardMoves`/`MOVE_ICONS`, `swapEdits`.
- Commits (see `git log --grep "sturdy-base 33"`), built by Sol, reviewed by Sol (no defects; the id case now uses a node the old index math would not give).
- Tests: `agent-site.test.ts` gains the `move_section` case (real module on the memory workspace: new id, stayed, Undo reselect; module node used as is; stale/refused/failed mapping); the section-gap rules case runs through `pageRules`/`templateRules().to`; the controller's MCP case, the card Move cases, `withoutCardMoves` and `swapEdits` tests go. Unit 1,901/1,901; native-cards/page-sections/mcp 35/35; full native-save 885 passed, 1 failed (native-canvas:382, passed on rerun), 56 skipped; smoke 42/42; @actual 54/54.
