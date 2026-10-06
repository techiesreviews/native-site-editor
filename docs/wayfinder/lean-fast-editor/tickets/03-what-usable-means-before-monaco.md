---
title: Decide what "usable" means before Monaco loads
type: grilling (HITL)
status: open
assignee:
blocked_by: []
---

## Question

With the preview coming first (decided while charting), which features must work before Monaco arrives: preview selection, edit bar, inline text edits, the pages tree, drafts, undo, Save to GitHub? What triggers the Monaco download: idle time after first paint, hovering the Code grip, or opening a code pane? And where do the draft maps and the visual undo/redo history live once they are no longer in `src/components/code-editor.ts` (module-level Maps at `:133-304`, `createModel` at `:296`), since editing starts before that chunk loads?
