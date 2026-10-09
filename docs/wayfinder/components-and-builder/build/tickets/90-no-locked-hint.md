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
