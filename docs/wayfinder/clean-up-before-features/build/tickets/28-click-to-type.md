---
title: "Click on text in the preview and type straight away"
type: task (AFK)
status: closed
assignee: lead-28
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

## Done (2026-10-23)

- One click on editable text (a heading, a paragraph, a link's or a button's text, and text in formatting that is no text of its own, such as the `<del>` in `Was <del>£40</del> £30`, which types in its line: `textLine`) selects it and starts typing with the caret at the click point; a click beside a line of text (the space right of a short heading) or on an image or section only selects. Rule in `src/page-builder/rules/canvas-gesture.ts` (`click` + `onText` gives `edit`); the runtime checks the point against the text's lines, each padded to its element's line height so the gap between wrapped lines counts as text, and treats the element's outer 3 px (its outline) as no text (`onText`).
- A press and drag from text moves its block, also on the text being typed in (the press-drag no longer skips the text being typed in). Inside typed text a double-click selects a word, a triple-click the paragraph, Shift+click and Shift+arrows extend; Escape ends typing with the block selected; Enter on selected text still types; an image's double-click still opens its chooser.
- Fix found on the way: after typed text was written, the editor selected that text again and undid a click that had already chosen other text. The runtime now ignores that re-selection once another element was clicked since (`leftText`, cleared by every render, so a refused edit leaves nothing behind).
- Fix found on the way: a drag of the block being typed in, after typing, did not start (writing the text asked for a new render, and the host hears a drag's start only from its latest render). Whenever typed text was just written, by the drag or by the press before it, the start now waits for that render (`startPendingPress`), or 1 s for a host that asked for none.
- Tests: `tests/canvas-gesture.test.ts`; new `tests/native-save/native-click-to-type.spec.ts` (11 tests: the Done-when list, a click from one text onto another, a click between two wrapped lines and on the outline, a triple-click, a drag of typed text with its two undo steps, typing then dragging another block, a click inside a `<del>`, a click on other text after a refused edit); helpers `clickOnText` and `selectText` in `tests/native-save/click-text.ts`; about 25 specs moved from double-click to one click on the text, and 8 that clicked text and then pressed block keys (Escape to climb, Alt+arrows, Enter) now select with a click then Escape. `docs/page-builder/ux-research.md` selection note updated; `CONTEXT.md` did not describe double-click to edit.
- Commits 24b18ad8 (the build), c4146ee5 (first review fixes). `kit shots --compare dev` for the editor screen (390, 768, 1280 px, light and dark): before and after byte-identical, no new layout findings; `.scratch/shots/lead-28/20261023-132915` in the main checkout.
