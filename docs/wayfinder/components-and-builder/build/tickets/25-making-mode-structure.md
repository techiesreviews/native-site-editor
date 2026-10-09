---
title: Making mode in Structure
type: task (AFK)
status: open
assignee:
blocked_by: [22-making-mode-shell]
builder: sol
phase: 3
---

## What

Ticket [04](../../tickets/04-prototype-making-components.md) §2: while making, Structure shows one purple border round the section and its rows, readable in light and dark, with slot rows marked. `src/components/page-structure.ts` and `.css`.

- Prototype: `src/prototype/cb04-d.ts` (`decorateStructure` `:298`) on `prototype/cb-04-make-component`.

## Done when

- Nightly spec: in making mode the section's rows are framed and slot rows marked, in light and dark; the marks follow a chip toggle.
