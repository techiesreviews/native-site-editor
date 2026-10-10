---
title: "Remove the \"Filled from\" strip; the look chip stays on the new card's combobox"
type: task (AFK)
status: open
assignee:
blocked_by: [100-minify-preview-runtime]
builder: sol
phase: 6
---

## What

Lex (2026-10-10): remove the "Filled from …" info strip that opens after a new card is filled from a page (slices 53, 57, 96, 99), with its code, CSS and tests. Picking or creating a page fills the card and closes the combobox; the card stays selected with its normal edit bar. The look chip ("Card: card-project ▾") stays only on a new card's "Link to a page…" box (and Add card ▾ stays as is) — Option 2: no look switch on cards after they are linked. "Change page" goes with the strip. Content kept aside by a swap lives only while the combobox is open. The status line still announces the fill ("Filled from About Larkspur") for screen readers.

## Done when

- Specs updated (no strip; fill, one undo, look chip on the combobox before filling); screenshots light and dark. Blocked by 100 only to avoid a clash in the build.

**Also (Lex, 2026-10-10, annotation):** in the "Link to a page…" list, remove the group headings ("Under /work/", "Other pages"); keep the order (the cards' folder first, then the rest) as one plain list. Lex on the strip: "a user can remove and add a new one if needed" — no Change page anywhere.
