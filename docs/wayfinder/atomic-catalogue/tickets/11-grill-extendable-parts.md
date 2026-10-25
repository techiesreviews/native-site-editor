---
title: Decide how parts are built to be extended
type: grilling (HITL)
status: open
assignee:
blocked_by: [04-research-parts-inventory]
---

## Question

Parts are extended by options and slots, never copied (factory ticket 09). Today the editor builds UI with plain functions and shared classes (`src/ui/dom.ts` `button()`, `link()`, `node()`), with no web components. Decide:

- whether parts stay plain functions with options, become small web components with slots, or are CSS classes with modifiers;
- how a variant (icon before or after, text only, icon only) is chosen;
- how this stays readable for Lex editing by hand.
