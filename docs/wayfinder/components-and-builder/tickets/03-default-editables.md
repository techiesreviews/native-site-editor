---
title: Decide the default editables rule
type: grilling (HITL)
status: open
assignee:
blocked_by: []
---

## Question

With slots wrapping the whole element (settled), what exactly becomes a slot when a component is made, from HTML or directly? Candidates: every text element with only inline children (`TEXT_TAGS` in `public/native-preview-runtime.js:2247`), every `<a>`, every `<img>`/`<picture>`, buttons. How are slots named (class, then kind + index, as in `component-model.ts:969`), and which are optional (hidden when empty by `hideEmpty` in `components.js`)? What stays fixed in the template (decorative images, icons, wrappers)? How is a repeated group (a list of cards) handled: as the default slot, as in `section-cards`? Do the slot kind rules in `component-model.ts:286-320` (from fallback content, then from the name) stay as they are? techies-reviews' `card-tutorial` is the reference.
