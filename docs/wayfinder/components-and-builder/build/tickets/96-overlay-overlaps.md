---
title: "Small overlaps: the card combobox and strip over Open page; the ⋯ button over a badge being renamed"
type: task (AFK)
status: closed
assignee:
blocked_by: []
builder: sol
phase: 6
---

## What

From slices 54 and 66 (see their Done notes):
- On a newly added card, the "Link to a page…" combobox and the info strip partly cover the selected card's edit bar "Open page" button (`plain-4-filled-strip-dark.png`, `made-3-filled-strip-light.png` in .scratch/cb-build-shots/54/). Place them so they don't cover the edit bar (e.g. below the card, or flipped above when the bar is below).
- While renaming a slot badge in a narrow Structure row, the row's ⋯ button and its fade cover the end of the badge being typed in. Hide the ⋯ (and its fade) while the badge is being renamed.

## Done when

- Nightly checks for both (no overlap of the boxes); screenshots light and dark.

## Done (2026-10-10)

- "Link to a page…" and the fill strip hang below the card and its edit bar (below the bar when the bar is under the card), above both when there is no room below, else over the card beside the bar, clamped only when nothing clears it (pure `cardPopoverPlacement`, `src/components/card-popover-placement.ts`); they place again when the bar moves (`edit-bar-layout`). Only a moving pointer makes a page active in the combobox, so a list scrolled under a resting pointer keeps the arrows' choice. A Structure row's ⋯ bar and fade hide while its slot badge is renamed (`page-structure.css`).
- Commits b5b89646 (built by Sol) and the "Slice 96 review" commit.
- Tests: `tests/card-popover-placement.test.ts`; nightly `native-add-card.spec.ts` (combobox and strip clear the edit bar below a card under a sticky header, Open page hit-tests, light and dark; the existing combobox case at the default size now checks the bar is never covered) and `native-slot-context-menu-actual.spec.ts` (@actual: actions hidden while a narrow badge is renamed, back after Escape, blur, Enter; light and dark).
