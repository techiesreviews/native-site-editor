---
title: Find how the techies.tools Framework becomes the editor's shared values
type: research (AFK)
status: closed
assignee: claude (research subagent)
blocked_by: []
---

## Question

The catalogue's shared values are based on the techies.tools Generative UI Framework (`~/Projects/TechiesTools`: Primitives, Semantic Roles, Element and Component Guidance, its export). What does the Framework export today (format, names, values for colour, type, spacing, radius, motion, layers, shadows), and how does each map onto the editor's `src/theme.css` (121 custom properties, rules in `docs/editor-colors.md`)? Which editor values have no Framework counterpart, which Framework values the editor lacks (spacing, motion timing and easing, z-index layers, pill radius), and what would a generated `theme.css` look like? Can the export be re-run so the editor follows Framework changes, and what breaks if values shift?

## Resolution (2026-10-25)

Findings: `docs/wayfinder/atomic-catalogue/research/01-techies-framework.md` on branch `research/ac-01-techies-framework` (commit `28857383`, never merged).

- **The Framework covers** colour, type, spacing and radius, including a pill radius (`--radius-full`). It has **no motion, no z-index layers and no shadows**; its "layers" are only the cascade order of its CSS files. Motion, layers and shadows must be designed for the editor, or added to the Framework first.
- **The editor already uses the Framework's colours:** `--color-primary` and its six shades match its output for `#2563EB` exactly, under the same names. They drift only if the brand colour changes (the editor fixes its dark-shade lightness; the Framework scales it).
- **Its default type and spacing suit websites** (larger, fluid). Its manual mode fits the editor: spacing steps 2, 4, 6, 8, 12, 16 and 24 px cover 6 of the editor's 7 most-used gaps.
- **Size trap:** the editor's root text size is 14 px and the Framework assumes 16 px, so copied rem values come out 12.5% smaller unless a script converts them.
- **Gaps:**
  - The Framework lacks dark mode, status colours, hover and selected states, control heights, shadows, and the editor's 6 px radius and 11/12/15 px type sizes.
  - The editor lacks spacing, a pill radius, fluid type and font tokens.
- **Re-running:** there is no command, only a download button, with settings in one browser slot. Recommendation:
  - commit the exported `tokens.css`;
  - a script builds the shared-values part of `theme.css` from it;
  - a kit check fails when they disagree.
- **Open for ticket 06:** whether the editor gets its own Framework settings, separate from Lex's sites, plus three more questions listed in the findings.
