---
title: "Edit component mode: no Duplicate or Remove on the template's root"
type: task (AFK)
status: closed
assignee:
blocked_by: []
builder: sol
phase: 5
---

## What

From the bug fix on branch build/cb-fix-lex-1: in Edit component mode, selecting the template's root element (the component's own `<section>`) shows Duplicate and Remove in the edit bar (and greyed move arrows). None make sense on a template's root: hide them there (Duplicate, Remove, move arrows, Delete key from slice 81 when it lands). Children of the root keep their actions.

## Done when

- Spec: the template root's bar shows no Duplicate/Remove/move; a child's bar still does.

## Done (2026-10-10)

- In Edit component mode the template's root (a section's `<section>`, a card's `<article>`) has no Move up/down, Duplicate or Remove in the edit bar, and no `onMove`, so ⌘D, Delete/Backspace and Alt+Up/Down do nothing to it; children keep theirs. `templateRoot()` hoisted into `component-model.ts` (`isTemplateRoot` on the component tools). Slice 81's Delete key runs the bar's Remove, so it follows.
- Built by Sol, fixed by Claude. Tests: `templateRoot` unit test in `tests/template-structure.test.ts`; @actual test in `native-edit-component-mode-actual.spec.ts` (Section work's root and an opened card's root: no buttons, no palette commands, keys leave the source alone; a nested section child keeps all four and Alt+Down and Duplicate run, each undone).
