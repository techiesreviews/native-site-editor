---
title: "Design board: live, working frames (clicks, real hover, keyboard) and named parts"
type: task (AFK)
status: closed
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
- Every board card carries `data-part="<part id>"`; the Live cell carries the same `data-part` with `data-cell="live"`, so preview annotations (selector, styles, screenshot) point at a named part. A mock-up's four frames are each a live cell, told apart by `data-width` and `data-theme` (`[data-part="sharing-panel"][data-cell="live"][data-width="390"][data-theme="dark"]`).
- The editor's boot stays at 355 KB: the board only loads when opened.

## Files

`src/catalogue/board.ts`, `frame.ts`, `parts.ts`, `board.css`; `tests/catalogue-parts.test.ts`, `tests/native-save/native-catalogue-board.spec.ts`; `scripts/agents/shots/scenarios.ts` (the `catalogue` screen waited for the live menu drawn open).

## Done when

- A spec opens and closes the Live Row menu and the Live Confirm dialog inside their frames, by pointer and keyboard.
- A spec hovers, presses and tabs to the Live Button for real, and the board does not pan.
- Every card and every Live cell has its `data-part` name.
- `kit size` shows the editor's boot at 355 KB or lower.

## Done (2026-11-10)

- **Live cells work:** a part's Live cell is no longer inert. Inline parts (Button, Icon, Inline field, Sharing row) take real hover, press, clicks and the keyboard; Row menu and Confirm dialog draw in a live `<iframe>` (`frameElement({ live: true })`, `?live=1` in the frame's query) where they start closed: the Actions button opens and closes the menu (it reads on the press whether the menu was open, since the press moves focus out of the menu and closes it first), Escape, an outside press or an item close it; a trigger button (`<action>…`, cut short with an ellipsis when long) opens the dialog, Cancel, the action or Escape close it. Mock-up frames are live too. A redraw with new options closes an open live menu first (`cat-redraw`).
- **The board around them:** a press on a live part selects its card without panning or opening the Options sheet (an inline part directly; a frame through `cat-frame-press`). A press on the stage's empty space still pans and taps as before. A wheel over a live frame is handed to the board at the same place through its zoom (`boardPoint`), so it zooms and pans as elsewhere. The keyboard reaching a live cell (focus entering it after a key, `cat-frame-key` from inside a frame) selects its card and flies to it when it is off screen or the board is below 50 %. On a touch screen (`pointer: coarse`) a live frame takes touches once its card is selected, so a finger elsewhere still pans; while the board pans or Space is held, live cells let the pointer through.
- **State cells stay pictures:** the fixed state columns are inert as before, and their frames are inert inside too. A dialog drawn open there still takes focus as it opens; the board takes it back once that is over, the window first, also when its page is in the background (it listens for the `<iframe>` taking focus as well as the window losing it, reads the state again in the timer, and falls back to the canvas when nothing had focus yet). This also fixes keys not reaching the board after a fixed menu or dialog frame drew.
- **Named parts:** every card has `data-part="<id>"`; every Live cell has the same `data-part` and `data-cell="live"`; mock-up frames also `data-width`; a frame's own page puts `data-part` on its stage.
- **Tests:** `tests/catalogue-parts.test.ts` +2 (a live frame's query and `frameOf` reading it back; `boardPoint`). The spec +8, each seen failing before its change: every card and live cell is named; the live Button reacts to real hover and press, a drag from it does not pan, Tab reaches it with a focus ring, Space and Enter press it; the keyboard reaching a live cell too small to see selects and flies to it; a press on a live frame selects its card and leaves the board still; a mock-up frame takes real hover, a click and Tab, and focus reaching it selects its card; the live Row menu opens and closes by its button, an outside press, Escape, Enter and choosing an item, a drag from the frame does not pan, and the live Confirm dialog opens and closes by pointer and keyboard; a mouse wheel over a live frame zooms the board; after a click in a live frame, a key there and then focus reaching the next card's frame flies to it. Three earlier tests read the fixed frames for the open menu, or open the live one first. The helper `settled()` also waits until no state frame holds focus.
- **Not covered by a spec:** a touch drag across a live frame (Playwright has no touch drag without raw CDP events); Tab leaving one frame straight into the next (headless Chromium leaves focus on the frame's body), so the spec focuses the next frame as that Tab would.
- Feature list: no change (the board is a preview-only page, not an editor feature; `docs/agents/features.md` has no area for it, and `tests/features-list.test.ts` fixes the areas)
- **Checks:** `RESULT: ok size boot 355 KB (±0 KB) vs dev@f8c13b9, budget 355 KB`; `RESULT: ok unit 12/12 (1 files)` (`kit unit --affected`); `RESULT: ok specs 1/1 passed` (16 passed, WebKit skipped), three runs in a row; `npm run check` (`RESULT: ok tokens in step`) and `npm run lint` exit 0. `RESULT: ok shots 14 files, 0 failed, 4 layout findings` for `kit shots catalogue` (the four: the Motion card's Play buttons under 24 px at the 768 px first view's zoom, as on dev); a raw shots spec of the live Button hovered, the live menu closed and open, and the live dialog open.
