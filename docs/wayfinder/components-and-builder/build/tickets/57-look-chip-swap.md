---
title: Swap a card's look and keep its content
type: task (AFK)
status: open
assignee:
blocked_by: [56-add-card-look-gallery, 53-fill-card-and-info-strip]
builder: claude ★
phase: 6
---

## What

Ticket [09](../../tickets/09-prototype-add-existing-page.md) §8 and §10.

- A "Card: card-project ▾" chip on the combobox, and on the strip after filling, opens the same set of looks and swaps the card in place.
- Content is kept by slot role (title, body, image, link; other slots by name), read back from the card so canvas edits carry over. Fallback text doesn't count as content.
- What the new look has no slot for is kept aside, not lost, listed as "Not shown by card-quote: image (no image slot)", and comes back on a swap to a look with a place for it. It lives in the editor while the page is open (a swap back restores it) and is gone after a reload or a page switch; nothing is written to the HTML (decided at handoff, 12).
- Each swap is one undo step. The swap is a pure function.
- Prototype: `prototype/cb-09-add-existing-page`, `src/prototype/cb09-core.ts` (`readCard` `:276`, `mergeContent` `:311`, `dropped` `:318`, `cardMarkup` `:335`), `cb09-look.ts` (`lookMenu` `:115`).

## Done when

- Unit tests: keep by role; fallback not counted; kept-aside listed and restored; other slots by name.
- Nightly spec: swap a filled card to a look without an image and back; the image returns, and the HTML never holds the kept-aside image. After a page switch, swapping back does not bring it back.

**Also (2026-10-10, from slice 56):** the look list (shared with the ▾ gallery) must leave out attributes the site's scripts set, as the edit bar does (slice 71); fix it once for both.
