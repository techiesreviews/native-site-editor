---
title: Decide the block set and its markup
type: grilling (HITL)
status: open
assignee:
blocked_by: []
---

## Question

The builder has Section/Div, Image, Button, Heading, Paragraph, Span and Link with the button class. What markup does each insert? For example: is Button `<a class="btn">` or `<button>`, given that a static site's `<button>` does nothing without JS; is Section `<section>` with an inner container class; what is the default heading level, chosen by position? Which site classes are used (`.btn`, `data-variant` on buttons) and how are they found in a site that has none? Where may each block be dropped: Sections only at page level or also inside containers, and Span only inside text? How do the new blocks relate to the existing Add panel elements (`native-elements.ts:37-43`), the disabled Columns/Grid layouts and the unused `static-section-defaults.ts`: replaced, merged or kept?
