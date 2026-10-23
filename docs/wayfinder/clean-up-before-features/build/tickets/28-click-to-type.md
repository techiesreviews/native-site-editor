---
title: "Click on text in the preview and type straight away"
type: task (AFK)
status: open
assignee: lead-28 (this session)
builder: claude
blocked_by: []
---

## Goal

Lex (2026-10-23): "In the page preview, I want to be able to click, and directly select and type text to make changes." Decisions in [Lex's request](../../../../work/lex-requests/issues/01-click-to-type.md). Today one click selects and a double-click starts typing (`src/components/native-preview-runtime.js` ~3000–3030, `src/page-builder/rules/canvas-gesture.ts`).

## Decided behaviour

- One click (press and release without moving) on editable text (including the text of links and buttons) selects that element and starts typing at once, with the caret exactly where he clicked; the edit bar shows for that text. A click inside the text already being edited moves the caret, as today.
- **Press and drag always moves the block**, also when the press starts on text (today's drag rules, thresholds and drop targets unchanged).
- Words are selected by double-click (word), triple-click (paragraph), Shift+click and Shift+arrows, inside the text being edited.
- Esc while typing ends typing and selects the whole block (as the block it is); a click on a block's outline or on a non-text area selects the block without typing.
- Images unchanged: one click selects, double-click opens the Image popup. Other non-text elements unchanged: one click selects.
- Link addresses stay in the edit bar; a click on a link never follows it.
- Keyboard: Enter on a selected text block still starts typing.
- Update `docs/page-builder/ux-research.md:34`'s selection note and CONTEXT.md if it describes double-click to edit.

## Files

- `src/page-builder/rules/canvas-gesture.ts` (+ its unit tests)
- `src/components/native-preview-runtime.js` (press, click, dblclick and drag handlers only)
- `tests/native-save/native-canvas.spec.ts`, `tests/native-save/native-typing-history.spec.ts` and the specs that open typing by double-click today (find with `grep -rln "dblclick" tests/native-save`); add `tests/native-save/native-click-to-type.spec.ts`
- `docs/page-builder/ux-research.md`, `CONTEXT.md` (only if they describe double-click to edit)

## Done when

- A browser spec proves: one click on a heading, a paragraph, a link's text and a button's text puts the caret at the click point and typing changes that text; press-and-drag starting on text moves the block; double-click selects a word and Shift+click extends; Esc selects the whole block; one click on an image selects it and double-click opens the Image popup.
- Existing specs that relied on double-click to start typing are updated to one click (not deleted).
- `kit unit --affected`, `kit specs --affected`, `npm run check` green; `kit shots --compare dev` for the editor screen shows no layout change at rest.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Does not edit `src/main.ts`; may run beside any slice. `kit bg slice-28 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`.
