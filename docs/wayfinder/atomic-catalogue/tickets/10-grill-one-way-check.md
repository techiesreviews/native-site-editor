---
title: Decide the one-way check on one-offs
type: grilling (HITL)
status: open
assignee: Lex + claude (grilling)
blocked_by: [04-research-parts-inventory, 06-grill-shared-values]
---

## Question

What counts as a one-off:

- raw px spacing, raw radius, a shadow or timing outside the shared values;
- a local custom property;
- a bespoke class that copies a part.

Where the count lives (a file in the repo), which kit command runs it (`kit pr`'s css tier, beside `scripts/check-colours.mjs`), and what happens when a slice raises it.
