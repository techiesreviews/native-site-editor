---
title: "Edit component mode's bar fits at every width"
type: task (AFK)
status: closed
assignee:
blocked_by: []
builder: sol
phase: 5
---

## What

From slices 22 and 85 (see their Done notes): Edit component mode's bar ("Editing <tag> · used on N pages ▾ · Show this page's content / Show placeholders · note · Done") is crowded. At 760 px, Done overlaps "used on 1 page" and the device buttons, and Show placeholders can't be clicked; at 1440 px with a plan note showing, the Show toggle is cut off. Make the bar fit at every width the editor supports: items wrap or shrink in a sensible order (the note shrinks first to an icon with its count, then "used on N pages" to "N pages", then the toggle to a compact two-state switch with an accessible name), Done always visible and clickable, nothing overlapping the device buttons. Light and dark.

## Done when

- Nightly spec at 1440 (with a note), 1024, 760 and the narrowest supported width: every control visible, not overlapping, clickable; screenshots of each.

**Changed (Lex, 2026-10-09):** remove the Show this page's content / Show placeholders toggle entirely; the mode always shows the template's placeholders.

## Done (2026-10-09)

- Show toggle removed (Lex, 2026-10-09): the mode always shows the template's placeholders; the toggle, its CSS, the page-content view path (frame mode `show`, runtime, items-slot count) and its spec steps are gone (slices 22, 23, 41 specs follow).
- The bar fits by measured stages (`src/page-builder/edit-mode-bar-fit.ts`): off-screen copies measure each stage once per content change, a ResizeObserver picks the first that fits: the note shrinks to an info mark and its count, then "used on N pages" to "N pages" (accessible names keep the full text), then the bar wraps with the device tools on their own row. Done always visible.
- Tests: `tests/edit-mode-bar-fit.test.ts`; nightly `native-edit-mode-bar-fits.spec.ts` (1440, 1024, 760, 390 with a plan note, light and dark: every control visible, inside, not overlapping, clickable). Screenshots in `.scratch/cb-build-shots/89/`.
