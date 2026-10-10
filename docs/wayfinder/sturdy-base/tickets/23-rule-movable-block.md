---
title: "One rule for which block a press or drag may move, in the editor and the runtime"
type: task (AFK)
status: open
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
