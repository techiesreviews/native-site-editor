---
title: Make component and + New component open Edit component mode
type: task (AFK)
status: closed
assignee:
blocked_by: [41-edit-mode-shell, 22-make-component-creates-at-once, 27-new-component-in-add]
builder: sol
phase: 5
---

## What

Ticket [04](../../tickets/04-prototype-making-components.md) §6 and §12 (as amended, Lex 2026-10-09), [14](../../tickets/14-prototype-edit-component-visually.md) §1: after Make component (which creates at once, slice 22, from the edit bar, Structure or right-click, slice 26) and after "+ New component" (slice 27), the visual Edit component mode opens on the new instance instead of the code pane. Whichever of the two still opens the code pane when this slice starts is switched here (slice 22 may already land in the mode; slice 27 opens the code pane).

## Done when

- The `@smoke` specs of slices 22 and 27 assert the mode opens on the new instance (its frame and slim bar showing the new tag).

## Done (2026-10-10)

- Make component already opened Edit component mode on the new instance (slice 22); its `@smoke` spec (`native-make-component.spec.ts`) already asserts the frame and `Editing<tag>`, and it has no code-pane fallback left beyond the status-line notes when the mode can't load. "+ New component" now frames the inserted instance (`newComponent` passes `{ path, node }` to `editComponent`) instead of relying on the selection, which often left only the code pane.
- Commit 4c754b3f (built by Sol). Tests: `native-new-component.spec.ts` `@smoke` and gap tests assert the mode's frame and `Editing<section-services>` (both fail without the fix). No new pure rules.
