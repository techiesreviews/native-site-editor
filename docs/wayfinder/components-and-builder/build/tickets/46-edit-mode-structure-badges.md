---
title: Edit component mode in Structure
type: task (AFK)
status: closed
assignee:
blocked_by: [44-edit-mode-slot-chip-label]
builder: sol
phase: 5
---

## What

Ticket [14](../../tickets/14-prototype-edit-component-visually.md) §5: Structure shows the end result, the editor's normal rows, names and icons for the component. This slice also builds what slice 25 (dropped with making mode, Lex 2026-10-09) would have provided, now for Edit component mode:

- One purple border round the component and its rows, readable in light and dark (`src/components/page-structure.ts` and `.css`).
- Each part that is or can be a slot carries the shared chip (slices 23–24) as its badge: purple when a slot, pink for an items slot, muted and struck through when fixed. Click and double-click behave as on the label and go through slices 44 and 45; a badge and the label chip for the same part change together.
- Prototype: `prototype/cb-14-edit-component`, `src/prototype/cb14-tree.ts` (`drawTree` `:107`); the frame idea from `src/prototype/cb04-d.ts` (`decorateStructure` `:298`) on `prototype/cb-04-make-component`.

## Done when

- Nightly spec: in the mode, the component's rows are framed in light and dark and carry badges matching the label chip; toggling or renaming a badge changes the label chip at once and applies the change to the template and every page.

## Done (2026-10-10)

- In Edit component mode the framed instance's Structure row lists its template's parts as the end result (`templateStructure` in `component-model.ts`, pure: slots resolved to their fallbacks at their source paths, text runs and headings as the runtime gives them, nested instances as leaf rows), inside one purple outline (`--component`, light and dark). Each part that is or can be a slot carries the label's own slot chip (`editMode.badge`, one `templateChip` state rule for both, kept names included): click toggles, double-click renames in place, mirrored with the label through `applyChip`. Rows select their template part; no page-only actions. Structure redraws on template, mode and level changes (`pageStructure.refresh`).
- With slice 47: an opened nested card's rows show under its row, the outline moves round it, the outer levels stay as muted, inert rows; a nested instance row of the level edited has "Open ›". The runtime's structure report gives the page's real slot name while placeholders show (it read `ase-placeholder:…`, slice 41).
- Built by Sol, fixed by Claude. Tests: `tests/template-structure.test.ts` (7); `native-structure-badges-actual.spec.ts` (@actual: rows, outline contrast light/dark, badges vs label, toggle, rename mirrored, Undo, code edit refresh, no `ase-placeholder` slot reported, nested card and back). `native-slot-chip-actual.spec.ts` drops the Show toggle's page count (ticket 14 amendment).
