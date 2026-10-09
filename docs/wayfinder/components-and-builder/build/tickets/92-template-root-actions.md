---
title: "Edit component mode: no Duplicate or Remove on the template's root"
type: task (AFK)
status: open
assignee:
blocked_by: []
builder: sol
phase: 5
---

## What

From the bug fix on branch build/cb-fix-lex-1: in Edit component mode, selecting the template's root element (the component's own `<section>`) shows Duplicate and Remove in the edit bar (and greyed move arrows). None make sense on a template's root: hide them there (Duplicate, Remove, move arrows, Delete key from slice 81 when it lands). Children of the root keep their actions.

## Done when

- Spec: the template root's bar shows no Duplicate/Remove/move; a child's bar still does.
