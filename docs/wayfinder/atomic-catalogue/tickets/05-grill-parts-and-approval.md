---
title: Decide the parts list, its order and what approved means
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: []
---

## Question

Which parts are in catalogue version 1, and in which order are they made (shared values, then atoms, molecules, organisms)? What does "approved" mean for a part: which states and widths Lex sees, and how he marks it approved or "needs change" on the board? Where is that mark kept, and what happens to a screen still using an unapproved copy?

## Resolution (2026-10-25)

Decided with Lex (all "yes"):

1. **Version 1 has 24 parts**, from [research 04's proposal](04-research-parts-inventory.md#resolution-2026-10-25):
   - 14 atoms: icon, button, icon button, close button, text field, select, tick box, radio, switch, badge, section heading, spinner, progress bar, keyboard key;
   - 10 molecules: tooltip, label with field, search field, menu item, menu, dialog, tabs and segmented group, empty state, card or tile, in-place notice;
   - plus the agents map's new parts: pin, name chip, caret with circle, agent outline.

   The organisms (edit bar, Page Structure, Media and so on) are rebuilt from parts afterwards, one at a time.
2. **Order:** shared values, then atoms, then molecules, then organisms one by one. Each step is merged and checked before the next.
3. **Approved means:**
   - Lex sees a part in every option and state (hover, pressed, focus, disabled, busy), light and dark, at laptop and phone width;
   - he marks **Approve** or **Needs change** with a note on the board;
   - the board saves the mark to `src/catalogue/approvals.json` through the editor's own Save to GitHub;
   - screens using old copies keep working until their organism's turn.

## Comments (after resolution)

- 2026-10-25, Lex on the board prototype: only **Approve**, with no Needs change and no note. Approving moves the part into the editor: it starts that part's replacement slice. This replaces item 3's "Approve or Needs change with a note"; see [ticket 08](08-prototype-board.md#resolution-2026-10-25).
