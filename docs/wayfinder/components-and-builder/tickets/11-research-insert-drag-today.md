---
title: Research what insert, drag and move support today
type: research (AFK)
status: closed
assignee: claude (research subagent)
blocked_by: []
---

## Question

What do `add-panel.ts`, `insert-drag.ts`, `insert-target.ts`, the canvas move code and the Structure tree support today for dropping into nested containers? Cover drop targets inside a section or div versus only canvas gaps, drop indicators, moving existing elements by drag on the canvas and in Structure, keyboard alternatives, undo granularity, and how components (shadow roots, slots) limit dropping inside an instance. List each gap the builder would need to close, with file:line pointers and rough size.

## Resolution (2026-10-08)

Full findings: branch `research/cb-11-insert-drag-today` (commit 41afe17), file `docs/wayfinder/components-and-builder/research/11-insert-drag-today.md`. It lists 15 gaps with file:line pointers and sizes.

1. **Source edits already nest.** `nativeMarkupInsertEdit` and `nativeMoveEdit` insert into and move across any valid container, following HTML content rules, as one guarded edit each. The UI and the runtime don't use them yet.
2. **Drop targets exist only between sections.** Gaps are reported only in containers that already hold a section (`native-preview-runtime.js:772`), plus the end of `<main>`. There are none inside a section or div, and none running sideways, because only y is measured (`insert-target.ts:192`).
3. **Add offers sections only.** The element choices (Heading, Text, Image…) were taken out of Add on 2026-10-03 (`ae910d8`) and remain in the code, unwired. That set never had Section, Div or Span, and its link has no button class.
4. **Drag moves whole sections among their siblings only,** on the canvas (`main.ts:1979`, `:2193`) and in Structure (`page-structure.ts:389`). The keyboard (Alt+↑/↓) stays among siblings. A tested "Move to…" helper (`native-move-choices.ts:99`) exists but is unwired.
5. **Undo needs no work:** every insert or move is already one undo step.
6. **Component instances take no drops,** because custom elements are sealed in source edits (`native-operations.ts:112`, `:256`). Whether drops into an instance are refused or offered as its named slots is still open, for the block-set or drag-and-drop ticket.
7. **Biggest gaps:** nested pointer-driven drop targets (L), drops into instances (L), sideways gaps for rows and grids (M), cross-container canvas drag (M–L), nesting in the Structure tree (M), indent/outdent keys plus the Move to… picker (M), and wiring the element catalogue back into Add (S–M).
