---
title: Decide where the panel writes its CSS
type: grilling (HITL)
status: closed
assignee: 
blocked_by: [02-research-components-and-old-panel, 09-research-answers-from-the-code]
---

## Question

With research 02: which stylesheet and selector a change goes to, how variants fit, what happens when a rule already exists, and how agents (MCP) make the same changes.

## Resolution (2026-10-26)

From research 02 and 09, confirmed by Lex in ticket 03:

- **Element styles** go in the component's own stylesheet, with the shortest selector from its class or tag. Elements outside components are styled through site classes.
- **Looks** (variants) are `:host([data-…])` rules in the component's CSS. "+ New look" makes one, and the edit bar's variant controls pick it up.
- **Site classes** (`styles/classes.css` and similar) are edited in place, marked Site-wide. "New site class" adds one.
- **Design values** are changed in place in `styles/tokens.css`, keeping `@layer tokens`. A colour's plain fallback, its `light-dark()` pair and the `tones.css` overrides change together.
- **Existing rules:** the old CSS writer (`css-write.ts` at `1aada9c8c^`, 40 tests) comes back.
  - It reuses a matching rule or `@media` block, inserts state and size rules, and keeps layers, indentation and CRLF.
  - It refuses to write over source that has changed meanwhile.
  - A new base rule goes before the file's first `@media` block.
- **Sizes:** Tablet writes `@media (max-width: 768px)` and Mobile `@media (max-width: 390px)`, reusing a matching block. Hover is guarded as in good-css.
- **No conversion:** the starter's existing CSS stays as it is (Lex: "use what exists"). The panel writes clean good-css only where it changes something.
- **Agents:** an MCP tool calls the same writer, so the CSS is the same whether a person or an agent makes the change.
- **Silent fix:** Text size stops writing inline styles on sites without `text-*` classes (`src/native-text-size.ts:9-14`).
