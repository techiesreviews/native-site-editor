---
title: Folded Structure rows spring open
type: task (AFK)
status: open
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
