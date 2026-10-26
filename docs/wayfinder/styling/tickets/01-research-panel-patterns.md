---
title: Find how the best visual styling panels work and what they write
type: research (AFK)
status: open
assignee: claude (research subagent)
blocked_by: []
---

## Question

Look at Webflow, Framer, Figma (Dev Mode), Paper, Penpot, Builder.io, Plasmic, Wix Studio and the browser DevTools' Styles pane. For each:

- which controls they offer and in what groups (layout, spacing, size, type, colour, borders, effects);
- how they show design tokens and variables;
- how they handle hover and focus states and screen sizes;
- **what CSS they write**: classes or inline styles, where it goes, how clean it is, and whether it stays editable by hand.

Then propose a control set for this editor that writes modern CSS following the good-css skill (logical properties, `clamp()`, container queries, `light-dark()`, tokens), in the site's own stylesheets. Include Mobbin and primary docs; date facts.

Findings on branch `research/st-01-panel-patterns`, in `docs/wayfinder/styling/research/01-panel-patterns.md`.
