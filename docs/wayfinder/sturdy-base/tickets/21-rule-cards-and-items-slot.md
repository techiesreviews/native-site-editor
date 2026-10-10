---
title: "One rule for card components, card slots and items slots, in the editor and the runtime"
type: task (AFK)
status: closed
assignee:
blocked_by: [20-runtime-bundle]
builder: claude ★
phase: 2
---

## What

Design: /home/ubulex/Projects/native-site-editor/.scratch/sturdy/frame-protocol-design.md (sections 3, 4.1). Sets the `RuleView` pattern slices 23 and 24 follow. Does not need sturdy slice 10.

- `src/page-builder/rules/tree.ts`: `RuleView<N>` (kind, name, children, decoded text, parent) and `meaningful(nodes, view)`: elements, and text holding a character other than ASCII white space (the browser's reading).
- `src/page-builder/rules/cards.ts`: `hasHeadingSlot(roots, view)`, `isCardTag`, `isCardSlot(slot, view, isCard)` (fallback all card components, at least one), `isItemsSlot(name, fallback, view, isCard)` (unnamed, or a card slot). Slot names as the browser reads them (decoded, not trimmed).
- Editor: component-model `hasHeadingSlot`, `isCardComponent`, `cardsOnly` (:523, used at :577, :1512) call the rule through a source view over `parseSource` nodes; card-slot.ts `cardSlotOf` loses its own blank loop (:31-34); block-insert `itemsSlots` reads `templateSlots(...).items` as now.
- Runtime: a DOM view (skips `injectedStyle`; a card's template is its shadow root's children); `dropCard`, `dropHeading`, `dropItemsSlot`, `cardSlot` go; `dropItem`, `dropSlots`, `cardSlotGridOf` call the shared rule.

**Disagreements this fixes (bugs):** `hasHeadingSlot` blank text used `.trim()` on undecoded source (a literal U+00A0 beside a heading slot made a card in the editor but not in the preview; `&#32;` the other way); `templateSlots` trimmed slot names (`<slot name=" ">` was the unnamed items slot to the editor only). Lead confirms "the browser's reading wins" before the build.

## Done when

- `tests/rules-cards.test.ts`: heading slot inside/around a heading, text and entities around it (both disagreements above as cases), nested instances, unnamed vs named items slot, a card slot with text between cards, run on a source view and on a plain-object view shaped like the DOM view.
- `rg "function dropCard|function dropItemsSlot|function cardSlot\(|function cardsOnly"` finds nothing; card-slot.ts has no blank-text loop.
- `native-drop-containers`, `native-cards`, `native-add-card*`, `native-card-paths*` specs green; `npm run check`, `npm test`, full `native-save` suite green.

## Done (2026-10-10)

- `rules/tree.ts` (`RuleView`, `meaningful`, `domView`) and `rules/cards.ts` (`hasHeadingSlot`, `isCardTag`, `isCardSlot`, `isItemsSlot`) are the one rule; component-model reads it through `sourceView`, card-slot.ts lost its loop, the runtime's `dropCard`/`dropHeading`/`dropMeaningful`/`dropItemsSlot`/`cardSlot` went. Behaviour: U+00A0 beside a heading slot is text and `&#32;` is blank in the editor too; a heading slot in another slot's fallback counts in the editor; slot names are untrimmed across the editor and the runtime (incl. its section fallback hiding), so `<slot name=" ">` is a named slot.
- Commits 126f81f8, 12e5c415 (review: whole-name fallback hiding, helper renamed).
- Tests: `tests/rules-cards.test.ts` (31, each case on a source view and a DOM-shaped view); remove.test.ts keeps a spaced name. Unit 1,624/1,624; full native-save 872 passed, 56 skipped; smoke 42/42; @actual 54/54. Runtime 80,163 bytes minified.
