---
title: Hand off the atomic catalogue build plan
type: task (AFK)
status: closed
assignee: claude (lead)
blocked_by: [06-grill-shared-values, 08-prototype-board, 09-grill-toast-replacements, 10-grill-one-way-check, 11-grill-extendable-parts]
---

## Question

Write `docs/wayfinder/atomic-catalogue/build/` in the style of the clean-up build:

- a README with rules, gates and waves;
- one slice per ticket.

Building starts after the agents and multiplayer build.

## Resolution (2026-10-25)

The build folder is `docs/wayfinder/atomic-catalogue/build/`: a [README](../build/README.md) and 49 slices.

- **Wave 0, foundations (7):** `light-dark()`, Framework shared values, motion, layer and shadow tokens, the one-offs count, the board page, recovery before toasts, toasts off.
- **Wave 1, atoms (5).**
- **Wave 2, molecules and agent parts (8).**
- **Replacement slices (13):** each gated on Lex's Approve in `src/catalogue/approvals.json`.
- **Wave 3, organisms (15):** one at a time; 54–64 re-planned when reached.
- **Close-out (1).**

Gate: starts after the agents and multiplayer build is released. First wave: 01 and 06.
