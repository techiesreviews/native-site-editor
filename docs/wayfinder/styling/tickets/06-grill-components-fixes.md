---
title: Decide the Components section fixes
type: grilling (HITL)
status: closed
assignee: 
blocked_by: [02-research-components-and-old-panel]
---

## Question

With research 02's root causes and end-to-end faults: confirm each fix and its priority.

## Resolution (2026-10-26)

Lex raised no objection to fixing all eleven faults research 02 found (summarised in round 2). In order:

1. **Selector list:** chips tell site rules from the component's own, and site rules fold into "Site styles". Edit component mode stays in the component's own file. Make component copies only the selectors that match the component's own HTML.
2. **`var(--` suggestions:**
   - turn off Monaco's built-in duplicates (`src/components/monaco.ts:127`);
   - read token files the shown page doesn't load;
   - put this file's values first.
3. **Colours and swatches:** read the real colour from the preview, then show swatches in the suggestion list and inline in the code. Clicking a swatch opens the colour picker plus the colour variables (ticket 03).
4. **Ctrl+Home:** with the mouse on a `var()`, it no longer swaps the pane to `tokens.css` (`code-editor.ts:378-401`, `page-builder-host.ts:514-524`).
5. **Make component:** no toasts and no raw-selector note.
6. **The remaining smaller faults** are fixed as research 02 lists them.
