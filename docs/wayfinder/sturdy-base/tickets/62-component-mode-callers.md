---
title: "Callers ask the Edit component mode module; the mode ends when its page or its instance goes"
type: task (AFK)
status: open
assignee:
blocked_by: [61-component-mode-components, 33-block-move-mcp-and-dead-card-moves, 34-block-move-guard-test]
builder: sol
phase: 6
---

## What

Design: /home/ubulex/Projects/native-site-editor/.scratch/sturdy/edit-component-mode-design.md (sections 2.2, 2.4, 6, 9).

- main.ts reads `componentTools?.mode`: `entry()` for the guarded edit's `editModeEntry` port (814); `now()` for the rail's drag (351) and target (873), the row move guard (588), the Block move module's `editing` (853), `dragPageBlock` (905); `opened()` for `instanceSelection`'s opening test and `editingScopePath` (489, 1460). page-structure-controller.ts reads `now()` at 162, 569, 610, 864.
- `componentTools` loses `editModeTemplate()`, `editModeEntry()`, `editingScope()` and `isTemplateRoot()`'s mode test (a root check on `now()`'s template stays where it is drawn).
- Slice 34's guard test names `mode.now()` instead of `editModeTemplate()` (same rule: nothing outside block-move.ts chooses page vs template rules from the mode).
- Behaviour, if the lead agrees: M1, `onRouteShown` (main.ts:495) also calls `componentTools?.mode.sync()`: the mode ends as soon as its page leaves the preview (Ctrl/⌘+click on a link, an agent pin's Show page); M3, `refresh()`'s `sync()` ends the mode when its instance is no longer at its place on the page.

## Done when

- `grep -n "editModeTemplate\\|editModeEntry()\\|editingScope()" src` finds only the guarded edit's `editModeEntry` port names (guarded-edit.ts, editor-workspace.ts, main.ts:814).
- `page-structure-controller.test.ts` and `block-move.test.ts` template cases green with `now()`-shaped fakes; slice 34's guard green with a fixture for the new name.
- New browser specs: M1 (Ctrl+click a link inside the framed template: the bar leaves; a rail drag and a canvas press drag on the new page work); M3 (Undo past the mode's first step moves the instance: the mode ends).
- `native-edit-component*`, `native-block-move`, `native-block-drag`, `native-structure-drag`, `native-move-keys` green; `npm run check`, `npm test`, full `native-save` suite and the `@actual` group green; budget delta reported.
