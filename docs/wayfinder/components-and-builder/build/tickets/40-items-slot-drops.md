---
title: Drops into an instance's items slots
type: task (AFK)
status: closed
assignee:
blocked_by: [30-click-insert-by-selection, 33-drop-target-model]
builder: claude ★
phase: 4
---

## What

Ticket [12](../../tickets/12-prototype-drag-and-drop.md) "Items slots", [04](../../tickets/04-prototype-making-components.md) §9–10, [10](../../tickets/10-block-set.md) §5.

- A pure function that finds an instance's items slots: the unnamed slot, or a slot whose fallback is a card component (a `card-…` tag), which is what Make component writes for a repeated group (decided at handoff, 5). A slot holding one other nested instance (`card-project`'s `card-note`) is an ordinary slot.
- Drops and click-inserts into an instance write light-DOM children with that slot's `slot` attribute (none for the unnamed slot). The instance seal (`native-operations.ts:112`, `:256`) is bypassed only there. Any block may go in an items slot.
- Named slots that are not items slots refuse with the reason. A selected instance without an items slot refuses a click-insert with the reason.

## Done when

- Unit tests: items-slot detection (unnamed, a named slot with a `card-…` fallback, a slot holding one other instance that isn't one); an insert into the unnamed and into a named items slot; a refused named slot; the seal still holds elsewhere.
- Nightly spec: drag a Paragraph into a section component's items slot; click-insert into a selected instance.

**Clarified (2026-10-09), from slices 09 and 32:** a *card component* is a `card-…` component whose template has a heading slot (ticket 09 rule 9). An items slot is the unnamed slot or a slot whose fallback is a card component. So `<slot name="note"><card-note>…</card-note></slot>` (card-note has no heading slot) is an ordinary slot. Apply this one rule in `templateSlots` (slice 08's `TemplateSlot.items`) and in the preview's drop report (slice 32: today any `card-…` directly in the slot counts; check the instance's template for a heading slot, e.g. via its shadow root), with unit tests for both shapes.

## Done (2026-10-09)

- An items slot is the unnamed slot or one whose fallback is card components only, a card component being a `card-…` whose template has a heading slot (`templateSlots(template, templateOf)`, `isCardComponent`; the runtime's `dropCard` reads the fallback card's shadow root). `nativeMarkupInsertEdit(…, items, slot)` opens an instance's seal only at its items slots (also on the way, through their children), writing the `slot` attribute; moves stay sealed. `clickTarget` puts a block in a selected instance's first items slot after its last child there, after a selected child of an items slot in that slot, or refuses ("… is a component without an items slot"); drags into items slots now drop.
- Commits: "Items slots take blocks: drops and click-inserts write an instance's light DOM" (+ review fixes).
- Tests: `tests/component-model.test.ts` (items-slot shapes incl. card-note), `tests/block-insert.test.ts` (unnamed and named inserts, refusals, the seal elsewhere), `tests/block-insert-controller.test.ts` (drop and click with a slot), `tests/drop-indicator.test.ts`; nightly `native-block-drag.spec.ts` (Paragraph into `section-work`'s items between cards), `native-blocks.spec.ts` (click-insert into a selected `card-project`; the header refuses), `native-drop-containers.spec.ts` (card-… without a heading slot is an ordinary slot).

