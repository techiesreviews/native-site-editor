---
title: "One rule for which block a press or drag may move, in the editor and the runtime"
type: task (AFK)
status: closed
assignee:
blocked_by: [20-runtime-bundle, 21-rule-cards-and-items-slot]
builder: sol
phase: 2
---

## What

Design: /home/ubulex/Projects/native-site-editor/.scratch/sturdy/frame-protocol-design.md (sections 3, 4.1). Follows slice 21's `RuleView`. Does not need sturdy slice 10.

- `src/page-builder/rules/movable.ts`: `SEALED_TAGS` (template, noscript, xmp, noembed, noframes, svg, math), `isCustomElementName` (native-operations `customName` + `reservedCustom`), `sealed(n, view)` (a custom element, a sealed tag, or foreign content), `movableBlock(n, view, opensInto)`: inside `<main>` (never `<main>`), every sealed ancestor crossed through an items slot (`opensInto(instance, child)`, slice 21's rule), and not a sealed non-instance itself.
- Editor: native-operations `nativeMovableBlock` (:532) and the sealing in `atPath`/`opaque` (:112, :161) use the rule through a view over its `tree()` nodes.
- Runtime: `pressBlock` (:3102) keeps its climb (phrasing by computed display, `pressSelected`) and the owner check (`ownerPath(el) === page`), and calls `movableBlock` for the rest; `dropSealed` (:996, also used by the drop-container probe at 1115-1202) becomes `sealed` with the DOM view.

**Disagreement this fixes (edge bug):** the runtime sealed any tag with a `-` (so `font-face`, `annotation-xml`), the editor only valid unreserved custom names.

## Done when

- `tests/rules-movable.test.ts`: block in a section, in an instance's items slot (moves), in a named non-items slot (sealed), inside `<svg>`/`<template>`, `<main>` itself, header/footer outside `<main>`, a reserved custom name; on a source view and a DOM-shaped plain view.
- `tests/native-operations.test.ts` unchanged and green.
- `native-block-drag`, `native-block-move`, `native-move-host`, `native-drop-containers` specs green; `npm run check`, `npm test`, full `native-save` suite green.

## Done (2026-10-10)

- `src/page-builder/rules/movable.ts` holds `SEALED_TAGS`, `isCustomElementName`, `isInstance`, `sealed` and `movableBlock`; `domView` also reads the namespace (`MarkupView.foreign`). native-operations marks `opaque` and answers `nativeMovableBlock` through it over a view of its strict tree (its `customName`/`reservedCustom` went); the runtime's `pressBlock` keeps its climb and owner check and asks `movableBlock` for the rest, and `dropSealed` went for `sealed` over the DOM view. Behaviour: the runtime no longer seals dashed names that are no custom element names (`font-face`, `annotation-xml`), as the editor; built by Claude (no Sol), reviewed by Sol: no defects, one nested items-slot case added.
- Commits: see the ticket 23 commits on dev.
- Tests: `tests/rules-movable.test.ts` (23, each movable case on the editor's source view and a DOM-shaped view). Unit 1,735/1,735; full native-save 872 passed (2 load flakes passed on rerun), 56 skipped; smoke 42/42; @actual 54/54. Runtime 80,928 bytes minified.
