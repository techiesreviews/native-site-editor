---
title: + New component in Add
type: task (AFK)
status: closed
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

## Done (2026-10-09)

- "+ New component" heads the Add panel's list: an inline form (name normalised as typed, `<section-…>` tag preview, taken/reserved names refused in the form, Escape/Cancel keep Add open). Create drafts `components/<tag>/<tag>.html` and `.css` (`blankComponentFiles`, `src/page-builder/blank-component.ts`) and inserts the instance at the default insert point or the gap's, one undo step (`newComponent` in `components.ts`), then opens Edit component in the code pane (slice 49 switches it). Boot JS +1.3 KB gzip.
- Commit `967c9f9` (built by Sol). Tests: `tests/blank-component.test.ts`; `tests/native-save/native-new-component.spec.ts` (`@smoke` main path with undo/redo, normalising and refusals, gap insert).
- Open: redo re-creates the files asynchronously after the page edit is redone (same as `makeComponent`); a failed re-creation leaves the instance without files. A shared fix belongs with the history companion, not this slice.
