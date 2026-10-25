---
title: Find how the techies.tools Framework becomes the editor's shared values
type: research (AFK)
status: open
assignee: claude (research subagent)
blocked_by: []
---

## Question

The catalogue's shared values are based on the techies.tools Generative UI Framework (`~/Projects/TechiesTools`: Primitives, Semantic Roles, Element and Component Guidance, its export). What does the Framework export today (format, names, values for colour, type, spacing, radius, motion, layers, shadows), and how does each map onto the editor's `src/theme.css` (121 custom properties, rules in `docs/editor-colors.md`)? Which editor values have no Framework counterpart, which Framework values the editor lacks (spacing, motion timing and easing, z-index layers, pill radius), and what would a generated `theme.css` look like? Can the export be re-run so the editor follows Framework changes, and what breaks if values shift?
