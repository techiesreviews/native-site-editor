---
title: More room for the page on phones
type: task (AFK)
status: in-progress
assignee: claude (mm-117 runner)
blocked_by: [104-media-panel-size]
builder: claude
phase: 8
---

## What

Lex's answer to the audit's [Q3](../ux-ui-audit.md#questions-for-lex) (2026-10-15): on phones the page being edited gets only about 90–150 px, so the edit bar covers the selection and double-click, Play and checking a result hardly work.

- On phones (narrow layout only), while the page is being edited, Page structure and the code fold into a pull-up sheet with a small handle, so the page takes most of the screen. Pull up (or tap the handle) to bring them back; the sheet remembers its last height for the session.
- The edit bar never covers the selected element: it sits above or below the selection, whichever has room.
- Wider screens are unchanged. This is editor-wide, not only media: check text editing, blocks, components and the Add panel on a phone.

## Done when

- Specs at 390×844: selecting a picture leaves it fully visible with the edit bar; double-click on a picture opens the picker; the sheet opens and closes by tap and drag; keyboard users can reach it.
- Shots at 390 and 768, light and dark, before and after, of editing text, a picture, a video, and the sheet open.
- Full suite (`scripts/agents/full-suite.sh 3`) green; boot budget unchanged.
- Review by GPT-6.1 Sol (read-only `codex exec`) recorded.
