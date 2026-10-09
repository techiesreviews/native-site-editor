---
title: "Starter: base resets skip slotted parts"
type: task (AFK)
status: open
assignee:
blocked_by: []
builder: sol
phase: 2
---

## What

Lex (2026-10-09), from slice 64 (see its Done note): after Make component, page rules aimed straight at a part beat the rules copied into the component (on the About hero, `p { margin: 0 }` in `elements.css` beats the copied `.flow > * + *`, so the lead loses its top margin). In `~/Projects/native-site-editor-starter` on `dev`, write the base element resets so they skip slotted parts (`p:not([slot])`, as the heading rules already do), so component CSS wins on its parts and pages can still override. Then add one line to the editor's Components chapter (worker/site-conventions.ts) telling sites to write base resets that way, copy the chapter into the starter's `AGENTS.md` byte for byte, and refresh `fixtures/actual-starter` (drift test, slice 18).

## Done when

- Make component on the About hero keeps the lead's margin and the copied spacing (browser check as in slice 64's spec, on the starter); the real pages are pixel-identical; the drift test passes.
