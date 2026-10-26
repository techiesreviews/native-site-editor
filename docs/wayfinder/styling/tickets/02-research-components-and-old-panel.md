---
title: Find what the Components section gets wrong and why the old style panel went
type: research (AFK)
status: open
assignee: claude (research subagent)
blocked_by: []
---

## Question

- **The four faults** (Lex, 2026-10-15, in the to-do list):
  - the CSS selector picker lists selectors from outside the component;
  - `var(--` autocomplete only offers the open file's custom properties;
  - token colours are missing;
  - there are no colour swatches.

  For each, find the root cause with file and line, and the fix.
- **Test the Components section end to end** on the real starter (make, edit, variants, Edit component mode, CSS panes) and list every other fault.
- **The old style panel:** why the lean-fast-editor map removed it (git history, its tickets, Lex's words), what it could do, and which parts of it (or the style cascade, `src/style-cascade.ts`, `shared/cascade.ts`) a new panel can reuse.
- **Where element styles should be written:** given the components-and-builder decisions (site classes, data-attribute variants), how a panel's change becomes a rule. Does it go in the component's stylesheet or the site's, and with which selector? How do variants fit?

Findings on branch `research/st-02-components-and-old-panel`, in `docs/wayfinder/styling/research/02-components-and-old-panel.md`.
