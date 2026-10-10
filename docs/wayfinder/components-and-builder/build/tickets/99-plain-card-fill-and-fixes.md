---
title: "Plain cards fill their text and image too; look swaps add the :host rule; cards spec after slice 78"
type: task (AFK)
status: open
assignee:
blocked_by: []
builder: sol
phase: 6
---

## What

From slice 55 (see its Done note):
1. **Lex (2026-10-10):** on a plain HTML card grid, linking a new card to a page also fills the card's first paragraph after the title with the page's meta description, and its first image with the og:image, as card components do (slice 51's mapping, slice 54's plain fill). The strip lists the sources.
2. A slice 57 look swap to a card component without a link slot links the title but doesn't add `:host { position: relative; }` to the component's CSS; add it in the same undo step, as slice 55 does for fills.
3. `tests/native-save/native-cards.spec.ts:274` still expects "Alt+Up in the canvas does not move a card: only sections move", which slice 78 changed on purpose; update it to expect the move and its undo (don't loosen).

## Done when

- Unit tests for the plain fill (text, image, kept when absent); nightly spec: plain grid, pick a page → title, link, text and image filled, one undo; the look-swap CSS case; native-cards.spec.ts passes.
