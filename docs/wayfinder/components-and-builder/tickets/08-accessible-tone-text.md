---
title: Decide how tone variants keep text accessible
type: grilling (HITL)
status: open
assignee:
blocked_by: [07-variant-contract]
---

## Question

When a component offers colour variants (dark, light, accent, brand), how is text contrast against the brand colour guaranteed? Options: semantic tokens per tone (as in techies-reviews' `--semantic-*` `light-dark()` roles with contrast noted in comments), computed text colour (`contrast-color()`, OKLCH lightness flips) with a fallback, an editor check that warns when a tone fails WCAG AA (reusing MCP `inspect_preview`'s contrast code), or a combination. What does the starter ship for a site with one brand colour, and what happens when the user changes that colour?
