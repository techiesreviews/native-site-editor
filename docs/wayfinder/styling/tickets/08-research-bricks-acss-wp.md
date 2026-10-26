---
title: Find how Bricks, Core Framework, ACSS and WordPress block styles work
type: research (AFK)
status: open
assignee: claude (research subagent)
blocked_by: []
---

## Question

Lex wants the panel to work like Bricks Builder (round 1 of ticket 03). Find out:

- **Bricks:** its style panel inputs (free fields, units, suggestions on click) and its selector (element ID, global classes as chips, states and pseudo-classes, custom selectors, which selector is active). Also what CSS it writes and where.
- **Core Framework and Automatic.css:** how their right-click variable picker works in Bricks (what it lists, grouping, search, colour swatches, how a variable is inserted).
- **WordPress block styles and variations:** `register_block_style`, block variations, `theme.json` style variations. How users pick them, how they show in the editor, and how they map to classes (`is-style-…`). How this editor's data-attribute variants could borrow from them.

Propose how each maps onto this editor. Findings on branch `research/st-03-bricks-acss-wp`, in `docs/wayfinder/styling/research/03-bricks-acss-wp.md`.
