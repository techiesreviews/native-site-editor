---
title: + New component in Add
type: task (AFK)
status: open
assignee: sol (runner: claude)
blocked_by: [21-name-normalising]
builder: sol
phase: 3
---

## What

Ticket [04](../../tickets/04-prototype-making-components.md) §11–12.

- "+ New component" at the top of the Add panel's component list (`src/page-builder/add-panel.ts`).
- A small form: a name, normalised as typed with the `section-` prefix when it has no hyphen (slice 21), and the tag preview as typed. Create places a blank section component (a `<section>` with a `title` slot and an empty items slot) on the current page at the default insert point (`defaultInsertPoint`, `src/page-builder/insert-target.ts`), files and instance in one undo step, and opens Edit component (the code pane until slice 49).
- Prototype: `src/prototype/cb04-new.ts` on `prototype/cb-04-make-component`.

## Done when

- `@smoke` spec: + New component, name it "services" (the tag reads `section-services`), Create: the files are drafted and the instance is on the page; one undo removes both.
