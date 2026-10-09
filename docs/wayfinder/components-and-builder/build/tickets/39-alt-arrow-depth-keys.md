---
title: Alt+←/→ move out of and into containers
type: task (AFK)
status: closed
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

## Done (2026-10-09)

- `nativeElementDepthMove` (`src/page-builder/native-move-choices.ts`): out puts the element right after its parent in a Section or Div; in puts it at the end of the Section or Div just above it; Sections and anything directly in `<main>` refuse, as do a component above, `<main>` as the new parent and parts inside an instance. Alt+←/→ on the canvas (runtime keydown, not while typing) and on Structure rows (focus follows the moved row), one undo step each. Whole component instances now move through `nativeMoveEdit` (the same line as slice 36).
- Commits `976cfc0` (built by Sol), `deb5649` (review: a row moved into a folded container unfolds it and keeps focus).
- Tests: `tests/native-move-choices.test.ts` (out, in, round trip, refusals), `tests/native-operations.test.ts` / `tests/native-elements.test.ts` (instances move whole); nightly `native-move-keys.spec.ts` covers Alt+←/→ in Structure and on the canvas on the native-cards fixture.
