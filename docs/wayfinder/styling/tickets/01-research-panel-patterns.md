---
title: Find how the best visual styling panels work and what they write
type: research (AFK)
status: closed
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

## Resolution (2026-10-26)

Findings: `docs/wayfinder/styling/research/01-panel-patterns.md` on branch `research/st-01-panel-patterns` (commit `3a1b207ac`, never merged; `kit doctor` 7/7).

- **The same groups everywhere:** all nine tools group controls the same way (layout, spacing, size, type, colour, borders, effects). They differ in the CSS they write.
- **Webflow** writes readable classes in older habits: 308 physical spacing properties against 1 logical one on webflow.com, unguarded hover, and desktop-first breakpoints. Since June 2025 it supports `clamp()` and `color-mix()` in variables.
- **Framer, Wix Studio, Builder.io and Plasmic** write machine names (`framer-zprce9`, `#comp-…`) and keep the real styles in their own systems. Hand edits get overwritten.
- **Figma Dev Mode, Penpot and Paper** only show CSS. Worth copying: they show the token's name (`var(--space-2)`), not the raw number.
- **Chrome DevTools** is the only tool that edits a site's own stylesheets in place.
- **Recommendation:** DevTools' honesty with Webflow's plain controls:
  - three pickers at the top: target (site design, component, variant), state (normal, hover, focus, pressed) and size (all or narrow);
  - seven groups, offering tokens first and Custom last;
  - clean modern CSS in the component's stylesheet or `tokens.css`, with full examples in the doc;
  - a Code view that edits both ways and leaves what it doesn't understand alone.
- **To check:** whether container queries work inside a component's shadow styles. The starter's CSS doesn't follow good-css yet: hex colours, fixed px, unguarded hover, one width media query.
- **Open for Lex:** tokens first or tokens only; per-component sizes or page widths; two sizes or three; hover and focus shared by default; convert the starter's CSS once or as touched.
