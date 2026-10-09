---
title: Fixed parts are locked on the page
type: task (AFK)
status: open
assignee:
blocked_by: [41-edit-mode-shell]
builder: sol
phase: 5
---

## What

Ticket [14](../../tickets/14-prototype-edit-component-visually.md) §7.

- Outside the mode, a component's fixed parts can't be edited or dropped into on the page. Clicking one selects the instance; the name label says "○ Paragraph fixed in `<section-work>`" with an Edit component button that opens the mode with that part selected.
- Page Structure lists only the instance's slots.
- Code: `src/page-builder/components.ts`, `native-component-selection.ts`, `src/components/page-structure.ts`.
- Prototype: `prototype/cb-14-edit-component`, `src/prototype/cb14-label.ts` (`lock` `:77`).

## Done when

- Nightly spec: clicking a fixed paragraph selects the instance and shows the hint; Edit component opens the mode with that paragraph selected; Structure lists only slots.
