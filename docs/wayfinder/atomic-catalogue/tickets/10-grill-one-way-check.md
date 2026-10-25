---
title: Decide the one-way check on one-offs
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: [04-research-parts-inventory, 06-grill-shared-values]
---

## Question

What counts as a one-off:

- raw px spacing, raw radius, a shadow or timing outside the shared values;
- a local custom property;
- a bespoke class that copies a part.

Where the count lives (a file in the repo), which kit command runs it (`kit pr`'s css tier, beside `scripts/check-colours.mjs`), and what happens when a slice raises it.

## Resolution (2026-10-25)

Decided with Lex ("I think so", as recommended):

1. **What counts:** the seven hand-typed kinds counted in research 04 (1,502 today):
   - px spacing;
   - radii;
   - shadows;
   - timings;
   - local custom properties;
   - z-index values;
   - px font sizes.

   Copies of whole parts are caught on the board and in review, not by the count.
2. **How it works:**
   - counts per CSS file live in one committed file (for example `scripts/agents/one-offs.json`);
   - `kit pr`'s css tier runs it beside `scripts/check-colours.mjs`;
   - a change that raises a count is blocked unless the lead waives it with a written reason;
   - a lowered count rewrites the file, so numbers only go down.
