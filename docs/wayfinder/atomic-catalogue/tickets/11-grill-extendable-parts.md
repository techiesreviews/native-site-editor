---
title: Decide how parts are built to be extended
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: [04-research-parts-inventory]
---

## Question

Parts are extended by options and slots, never copied (factory ticket 09). Today the editor builds UI with plain functions and shared classes (`src/ui/dom.ts` `button()`, `link()`, `node()`), with no web components. Decide:

- whether parts stay plain functions with options, become small web components with slots, or are CSS classes with modifiers;
- how a variant (icon before or after, text only, icon only) is chosen;
- how this stays readable for Lex editing by hand.

## Resolution (2026-10-25)

Decided with Lex ("This is for the editor, then use a"):

- **Parts are plain TypeScript functions with options**, in the style of `src/ui/dom.ts` `button()`/`node()`, for example `button({ tone: "quiet", icon: "plus", iconAfter: true })`.
- Each function renders plain HTML with one class per part, and variants as readable data attributes (`<button class="button" data-tone="quiet">`), so a look is found and changed by hand in one CSS file.
- Slots are function arguments.
- No web components and no CSS-only parts.
