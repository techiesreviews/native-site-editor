---
title: Folded Structure rows spring open
type: task (AFK)
status: closed
assignee:
blocked_by: [37-structure-mirror-and-x-depth]
builder: sol
phase: 4
---

## What

Ticket [12](../../tickets/12-prototype-drag-and-drop.md) §7: holding a non-Section block over a folded row that can take it (Section, Div, an instance with an items slot) for ~400 ms opens it, the caret turning as the cue; deeper rows open the same way. Rows opened this way fold back when the drag ends elsewhere or the pointer moves on below them; rows the user had open stay open. Nothing springs open while a Section is dragged.

- Prototype: `prototype/cb-12-drag-and-drop`, `src/prototype/cb12-tree.ts` (`springAt` `:69`, `cancelSpring` `:63`).

## Done when

- Nightly spec: a folded Section springs open under a held Paragraph and folds back after a drop elsewhere; a user-opened row stays open.

**Lex (2026-10-09):** "open the element where another element will be dropped in": while dragging (on the canvas or in Structure), the Structure row of the target container opens so its children and the drop line are visible — not only after a hover delay on a folded row. Rows opened this way fold back after the drop if the user hadn't opened them.

## Done (2026-10-10)

- Over Structure, a folded row that can take the dragged block (Section, Div, an instance's items slot) springs open after a 400 ms hold, its row tinted and its caret turning (no turn under reduced motion); a tree pick whose container row is folded opens it at once and picks again among its children (Lex's note; over the canvas slice 37 already unfolds to the target). Drag-opened rows below the pointer and off the target's way fold back while in the tree; at drag end all drag-opened rows fold back except the way to the drop; user-opened rows stay. Nothing springs or opens for a Section drag. In an instance opened so, the gaps among its named parts take the end of its items slot (they offered no place before). Rules `springRow`, `foldRows` in `src/page-builder/tree-drop.ts`; timer in `createStructureDrop`; DOM in `page-structure.ts` (`open`, `foldBelow`, `spring`).
- Commits `77531d41` (Sol), `c91a4e49`, `9861dc3e` (gaps among an open instance's named parts; slice 93's card-move spec moves x to the card's level first); preview `452cfd67`.
- Tests: `tests/tree-drop.test.ts` (springRow, timer with an injected clock, immediate open, fold-back), `tests/block-drag-session.test.ts` (leaving the tree clears the hold); nightly `native-structure-drag.spec.ts` (a held Paragraph springs a folded Section open and it folds back after a drop elsewhere; drag-opened rows below the pointer fold, user-opened stay; a folded Div opens at once when x asks for inside it).
