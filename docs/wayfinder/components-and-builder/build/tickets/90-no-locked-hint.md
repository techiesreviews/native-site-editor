---
title: "No locked-part hint in the edit bar label"
type: task (AFK)
status: closed
assignee:
blocked_by: [48-locked-fixed-parts-on-page]
builder: sol
phase: 5
---

## What

Lex (2026-10-09, annotations on the preview): remove the locked-part hint that slice 48 added to the edit bar's name label — the "○ Block fixed in `<section-hero>`" text and its **Edit component** button. Clicking a fixed part of a component on the page still selects the whole instance and stays locked (no text editing, drops refused or beside it); the instance's own edit bar keeps its usual Edit component action. Remove the hint's code, CSS and the "open the mode with that part selected" path if nothing else uses it. Amends ticket 14 rule 7 and slice 48.

## Done when

- Clicking a fixed part shows the instance's normal edit bar (no hint pill, no extra button); slice 48's spec updated to assert the absence (not loosened elsewhere: still locked, still refused).

## Done (2026-10-09)

- A click on a fixed part of any component selects the instance with its normal edit bar: the "○ … fixed in `<tag>`" text and its Edit component button are gone, with their CSS, the lock carried on the selection (`nativeLockedComponentPart`, the controller's handoff, the `editingComponent` port) and Edit component's open-on-a-part path. Still locked: no text editing, drops refused.
- Commit acbebbc8 (built by Sol, checked and finished by Claude). Lock-handoff unit tests removed with the code; `native-locked-fixed-parts-actual.spec.ts` asserts the normal instance bar and the hint's absence on two fixed paragraphs, the text lock, Structure slots and the drop refusal.
