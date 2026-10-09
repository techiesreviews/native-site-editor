---
title: "Starter: base resets skip slotted parts"
type: task (AFK)
status: closed
assignee:
blocked_by: []
builder: sol
phase: 2
---

## What

Lex (2026-10-09), from slice 64 (see its Done note): after Make component, page rules aimed straight at a part beat the rules copied into the component (on the About hero, `p { margin: 0 }` in `elements.css` beats the copied `.flow > * + *`, so the lead loses its top margin). In `~/Projects/native-site-editor-starter` on `dev`, write the base element resets so they skip slotted parts (`p:not([slot])`, as the heading rules already do), so component CSS wins on its parts and pages can still override. Then add one line to the editor's Components chapter (worker/site-conventions.ts) telling sites to write base resets that way, copy the chapter into the starter's `AGENTS.md` byte for byte, and refresh `fixtures/actual-starter` (drift test, slice 18).

## Done when

- Make component on the About hero keeps the lead's margin and the copied spacing (browser check as in slice 64's spec, on the starter); the real pages are pixel-identical; the drift test passes.

## Done (2026-10-09)

- Starter `dev` `b66fc67`: the margin reset in `styles/elements.css` reads `:is(h1, …, address):not([slot])`; all six pages pixel-identical at 1280 and 390 px; the chapter's new line copied into `AGENTS.md`. Editor: the Components chapter says base resets skip slotted parts; `fixtures/actual-starter` refreshed to `b66fc67` (brings slice 60's tones too). Make component copies a rule whose subject had `:not([slot])` with `:where([slot])` in its place, so the reset and heading sizes follow a newly slotted part without reaching parts kept in the template.
- Commits "Base resets skip slotted parts: chapter line, Make component carries them (slice 74)" and its review fix. Built by Sol, checked by Claude.
- Tests: `tests/component-css.test.ts` (guard turned to `:where([slot])`, grouped reset before spacing, fixed part left alone, ancestor and slot-name guards); `tests/mcp-runtime.test.ts` (the chapter line); `tests/native-save/native-resets-actual.spec.ts` (`@actual`: Make component on the About hero keeps the heading's and lead's computed styles, the lead's margin from the copied `.flow > * + *`).
