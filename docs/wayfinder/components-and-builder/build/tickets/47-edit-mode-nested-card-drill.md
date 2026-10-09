---
title: "Edit component mode: open a nested card component"
type: task (AFK)
status: open
assignee:
blocked_by: [41-edit-mode-shell]
builder: sol
phase: 5
---

## What

Ticket [14](../../tickets/14-prototype-edit-component-visually.md) §3: a nested card component opens with "◇ card-project ›" in the label (or "Open ›" on its Structure row), and the breadcrumb leads back out.

- Prototype: `prototype/cb-14-edit-component`, `src/prototype/cb14-tree.ts` (`treeHooks` crumb and drill `:23`), `cb14-app.ts` (the mode's chain).

## Done when

- Nightly spec: open the card from the section's mode, edit its fixed text, go back by the breadcrumb.
