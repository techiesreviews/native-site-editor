---
title: Decide what "usable" means before Monaco loads
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: []
---

## Question

With the preview coming first (decided while charting), which features must work before Monaco arrives: preview selection, edit bar, inline text edits, the pages tree, drafts, undo, Save to GitHub? What triggers the Monaco download: idle time after first paint, hovering the Code grip, or opening a code pane? And where do the draft maps and the visual undo/redo history live once they are no longer in `src/components/code-editor.ts` (module-level Maps at `:133-304`, `createModel` at `:296`), since editing starts before that chunk loads?

## Resolution (2026-10-06)

Decided with Lex.

1. Before Monaco, these must work (hard requirement, tested): preview selection, the edit bar and inline text edits; the pages tree.
2. Drafts, undo/redo and Save to GitHub also work before Monaco, because of point 4, but they are not a hard gate or a budget signal.
3. Monaco downloads on idle after first preview paint (and after the boot reads settle). Opening a code pane earlier jumps the queue. The two early prefetches (`main.ts:8549`, `:9246`) go.
4. Drafts and the visual undo/redo history move out of `code-editor.ts` into a Monaco-free draft store (plain text and snapshots). Monaco models are created from it on demand and only own typing undo inside a code pane.
