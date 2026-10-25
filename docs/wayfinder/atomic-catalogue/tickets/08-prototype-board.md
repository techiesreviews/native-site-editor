---
title: Mock up the catalogue board
type: prototype (HITL)
status: closed
assignee: Lex + claude (prototype)
blocked_by: [07-grill-board-look-and-use]
---

## Question

A clickable mock-up of the board with a handful of real-looking parts (button with its options, close button, menu item, switch, dialog), their states, light and dark, zoom, and the approve mark. Lex clicks through on laptop and iPhone (served online, like the agents map's mock-ups) and approves it or says what changes.

## Resolution (2026-10-25)

Lex reviewed the [board prototype](../prototypes/08-board.html), also served at `am-typing-together-poc.lexvd.workers.dev/mockups/catalogue-board.html`, and approved it with one change: "remove needs change, and only have approve. When approve is hit, it can move to the editor."

- **Only Approve:** no Needs change button and no note field. Lex asks for changes in chat with the lead, and they become a ticket as usual.
- **Approve moves the part into the editor:**
  - the mark in `src/catalogue/approvals.json` is the go-ahead for that part's replacement slice, which swaps every copy of it across the editor for the approved part;
  - the lead (later `kit next`, factory ticket 05) hands that slice out;
  - a part that is not approved never replaces anything.
- **Kept as built:**
  - panels float over the canvas at medium widths;
  - the proposed motion timings are checked on the board when the shared values land;
  - parts sit on the editor's panel background.
