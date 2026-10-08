---
title: Research variant discovery from component CSS
type: research (AFK)
status: open
assignee: claude (research subagent)
blocked_by: []
---

## Question

With variants free per component (settled), how can the editor find a component's variants reliably? Look at parsing `<tag>.css` for `:host([data-x="y"])`, `:host([data-x])` and `:host(:not([data-x]))` selectors (the editor's existing CSS parsing, and how `components.js` adds `::slotted` twins), how to tell the default value, how to label values for people (a CSS comment convention, `@property`, or the raw value), and what to do with variants that are combined (`:host([data-layout="image-left"][data-tone="dark"])`). Survey prior art briefly: Webflow component variants, Framer variants, Figma variant properties, Shoelace/Web Awesome attributes. Check how techies-reviews' `.btn[data-variant]` and `[data-color-scheme]` would fit. Give a recommended detection rule and its edge cases.
