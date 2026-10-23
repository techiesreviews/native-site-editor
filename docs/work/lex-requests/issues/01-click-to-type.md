---
title: "Lex (2026-10-23): click in the preview and type straight away"
status: closed
assignee: Lex + claude (grilling)
blocked_by: []
---

# Lex (2026-10-23): click in the preview and type straight away

## What

Lex: "In the page preview, I want to be able to click, and directly select and type text to make changes."

Today (`src/components/native-preview-runtime.js` around lines 3000–3030): one click selects an element; a double-click on text starts typing with the caret where he clicked (Enter also starts typing once a text element is selected; `docs/page-builder/ux-research.md:34`, Figma-style). A double-click on an image opens the Image popup. Pressing and dragging moves blocks.

Kind (UX feedback log): felt wrong once used. The look-back of 2026-10-22 already listed "click to select and double-click to edit" among the behaviours Lex corrected.

## Comments
- 2026-10-23, Lex decided: C1 one click on text puts the caret where he clicked and he types at once (edit bar shows for that text); C2 **dragging always drags the block** (also when the press starts on text); C3 Esc while typing (or a click on the outline) selects the whole block; C4 links and buttons work like C1 (their text is edited by one click; the link address stays in the edit bar); C5 images unchanged (one click selects, double-click opens the Image popup); C6 build now beside the clean-up, Lex tries it on preview. Lead decision: with drag reserved for blocks, words are selected by double-click (word), triple-click (paragraph), Shift+click or Shift+arrows. Built as [clean-up slice 28](../../../wayfinder/clean-up-before-features/build/tickets/28-click-to-type.md).
