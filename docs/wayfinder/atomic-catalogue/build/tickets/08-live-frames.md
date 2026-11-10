---
title: "Design board: live, working frames (clicks, real hover, keyboard) and named parts"
type: task (AFK)
status: open
assignee: fleet-lead
builder: claude
blocked_by: [05-catalogue-board]
---

## Goal

Lex (2026-11-10): "I want a live preview so I see and feel the interactions happening. So Live should be a working version." Orbit card TOOLS-203. Today every cell on the board, the Live cell included, is an inert picture: menus, dialogs and mock-ups sit in inert frames, and hover and pressed show only as fixed states.

## Decided behaviour

- The Live cell of every part works like the real thing: real clicks, real hover and press, and the keyboard (Tab reaches it; Enter and Space press). Pressing in it selects its card without moving the board.
- Menus and dialogs in the Live cell start closed, as in the editor: the menu's button opens and closes the menu (Escape, an outside click or choosing an item close it); a trigger button opens the dialog, and Cancel, the action or Escape close it.
- Mock-up frames work the same way (hover, clicks, keyboard).
- The fixed state columns stay inert pictures for comparing, menus and dialogs there drawn open.
- The mouse wheel or a trackpad over a live frame still zooms and pans the board.
- Every board card carries `data-part="<part id>"`; the Live cell carries the same `data-part` with `data-cell="live"`, so preview annotations (selector, styles, screenshot) point at a named part.
- The editor's boot stays at 355 KB: the board only loads when opened.

## Files

`src/catalogue/board.ts`, `frame.ts`, `parts.ts`, `board.css`; `tests/catalogue-parts.test.ts`, `tests/native-save/native-catalogue-board.spec.ts`.

## Done when

- A spec opens and closes the Live Row menu and the Live Confirm dialog inside their frames, by pointer and keyboard.
- A spec hovers, presses and tabs to the Live Button for real, and the board does not pan.
- Every card and every Live cell has its `data-part` name.
- `kit size` shows the editor's boot at 355 KB or lower.
