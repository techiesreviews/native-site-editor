---
title: Alt+←/→ move out of and into containers
type: task (AFK)
status: open
assignee:
blocked_by: []
builder: sol
phase: 4
---

## What

Ticket [12](../../tickets/12-prototype-drag-and-drop.md) §11: Alt+↑/↓ moves among siblings (today) and Alt+←/→ moves out of / into containers, on the canvas and on Structure rows.

- A pure rule beside `nativeElementSiblingMove` (`src/page-builder/native-move-choices.ts:84`): out puts the element right after its container; into puts it at the end of the previous sibling that can take it. Writes through `nativeMoveEdit`.
- Keys: the runtime's keydown (`native-preview-runtime.js`, Alt+Up/Down near `:2223`) and Structure (`page-structure.ts:816`).
- Prototype: `prototype/cb-12-drag-and-drop`, `src/prototype/cb12-keys.ts`.

## Done when

- Unit tests for out and into, including refusals (no container to enter, a Section).
- Nightly: `native-move-keys.spec.ts` covers Alt+←/→ on the canvas and in Structure.
