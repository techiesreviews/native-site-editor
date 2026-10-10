---
title: "Edit any text element's text in Page Structure, as with a component's slots"
type: task (AFK)
status: open
assignee:
blocked_by: []
builder: claude ★
phase: 4
---

## What

Lex (2026-10-10): in Page Structure, the text of plain page elements (headings, paragraphs, text elements, buttons, links) can be changed in the panel, the same way a component's slot text rows already can (the in-panel editor slice 79 mentions: double-click on a slot text row edits it in the panel). Today a double-click on a plain text row types on the page instead.

- Double-click (or Enter on a focused row) on any text row puts that row's text into the same in-panel editor the component slot rows use; Enter or leaving commits as one undo step, Esc cancels. Rich inline content (links, bold) keeps the rules the slot editor already has.
- The canvas follows live; the code pane follows the edit.
- The same in Edit component mode for the template's own text parts.
- Don't change single click (selects) or drag on rows.

Read the slot-text row editor in `src/components/page-structure.ts` (and slice 79's Done note) and reuse it rather than building a second editor.

## Done when

- Nightly spec: double-click a heading row in Structure, type, Enter → the heading's text changes on the page and in the source, one undo; Esc cancels; a paragraph with a link keeps its link; a button's label edits.
