---
title: "Lex (2026-10-23): click in the preview and type straight away"
status: needs-info
assignee: Lex + claude (grilling)
blocked_by: []
---

# Lex (2026-10-23): click in the preview and type straight away

## What

Lex: "In the page preview, I want to be able to click, and directly select and type text to make changes."

Today (`src/components/native-preview-runtime.js` around lines 3000–3030): one click selects an element; a double-click on text starts typing with the caret where he clicked (Enter also starts typing once a text element is selected; `docs/page-builder/ux-research.md:34`, Figma-style). A double-click on an image opens the Image popup. Pressing and dragging moves blocks.

Kind (UX feedback log): felt wrong once used. The look-back of 2026-10-22 already listed "click to select and double-click to edit" among the behaviours Lex corrected.

## Comments
