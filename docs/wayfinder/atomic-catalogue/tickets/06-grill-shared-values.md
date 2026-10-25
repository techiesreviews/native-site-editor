---
title: Decide the editor's shared values
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: [01-research-techies-framework]
---

## Question

With research 01 in hand, decide:

- whether the editor takes the Framework's spacing scale, motion timings and easing, layers, radii and shadows as they are, or adapts some;
- whether `theme.css` is generated from the Framework export or kept by hand with the Framework as reference;
- what happens to values with no counterpart.

## Resolution (2026-10-25)

Decided with Lex:

1. **A separate "editor" set of Framework settings** in manual mode. It is exported once and committed; a script builds the shared-values part of `src/theme.css` from it, converting for the 14 px root (the Framework assumes 16 px). A kit check fails when the two drift apart.
2. **Motion, z-index layers and shadows are editor tokens for now**, in `theme.css`. They may move into the Framework later. `--ease-out` gets defined.
3. **Kept and snapped:**
   - the 6 px radius and the 11, 12 and 15 px type stay as editor steps;
   - the stray 10 px gap snaps to 8 or 12;
   - dark mode keeps today's fixed-lightness colours.
