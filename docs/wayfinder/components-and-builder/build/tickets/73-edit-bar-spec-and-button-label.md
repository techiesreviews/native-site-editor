---
title: "Edit bar: update the controls spec for Make component; call a.btn a Button"
type: task (AFK)
status: open
assignee:
blocked_by: []
builder: sol
phase: 4
---

## What

From slices 02 and 31 (see their Done notes):
- `tests/native-save/native-edit-bar.spec.ts:175` fails on `dev` since slice 02 offered "Make component…" on every element; update its expected control list (don't loosen the check).
- The edit bar's name label and Page Structure call an `<a class="btn">` "Link"; call it "Button" (the block's name, ticket 10). Plain links stay "Link".

## Done when

- That spec passes; a unit or spec check that `a.btn` is labelled Button in the edit bar and Structure.
