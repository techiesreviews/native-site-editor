---
title: Put Make component back on the edit bar
type: task (AFK)
status: open
assignee:
blocked_by: [01-remove-masters-and-save-shared]
builder: sol
phase: 1
---

## What

The second slice of [02](../../tickets/02-masters-become-components.md) §2: Make component goes back where the masters' actions were.

- `src/page-builder/components.ts:440-447`: with `nativePageActions` gone, a selected plain section on a native page offers "Make component…" again; update the comment at `:125-127`.
- It opens today's dialog (`openMakeComponent`, `makeComponent` at `:1155`). Phase 3 replaces the dialog with making mode; this slice only restores the entry.
- Offer it on sections (open point 10 in the [spec](../spec.md): whether other elements get it is not decided).

## Done when

- Selecting a plain `<section>` shows Make component…; it makes a component as before, one undo step.
- The Make component tests in `tests/native-save/native-components.spec.ts` run again (nightly; the smoke for Make component comes with slice 22).
