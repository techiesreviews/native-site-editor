---
title: "Slot plan: whole-element slots named by role"
type: task (AFK)
status: closed
assignee: claude (slice runner)
blocked_by: []
builder: claude ★
phase: 2
---

## What

The core of ticket [03](../../tickets/03-default-editables.md) in `makeComponentPlan` (`src/page-builder/component-model.ts:1095`).

- §1 Text: each text element becomes one slot wrapping the whole element (`<slot name="title"><h2>…</h2></slot>`; `<h2 slot="title">…</h2>` on the page). Inline `a`, `strong`, `em`, `br` stay inside as rich text. Today's slot-inside-the-element branch (`:1137-1144`) and the `<span slot>` fill go.
- §3 Every `<img>` and `<picture>` is a slot, whatever its alt; a standalone link is a slot; inline `<svg>` and CSS backgrounds stay fixed.
- §4 Names from the role: first heading `title`, paragraph `text`, `image`, `link`, numbered on repeats (`text-2`); the class only breaks ties. Today's class-first `partName` naming changes.
- §8 Slot kind from the fallback element; `slotKindFromName` (`:418`) only for empty slots.
- Input for the making mode and `make_component`: the parts to keep fixed and slot renames. Output: each planned slot with its element's path, kind, name and whether it is a default slot, so chips can be drawn on it.
- The plan starts from any element except `<main>`, `<body>`, the header and footer components, and anything inside an instance (decided at handoff, 10); keep today's refusals (`makeComponentPlan`'s checks) and add the missing ones.
- Copying the element's page CSS into the component is slice 64.
- Prototype: `prototype/cb-04-make-component`, `src/prototype/cb04-rule.ts` (a DOM walk of the same rule).

## Done when

- `tests/component-model.test.ts` covers: the refusals; heading and paragraph wrapped whole; rich inline kept; standalone link and image slots; `picture`; `svg` fixed; role names and numbering; tie-break by class; a kept-fixed part; a renamed slot; kind from the fallback.
- Today's Make component (slice 02) writes whole-element slots on the starter.
