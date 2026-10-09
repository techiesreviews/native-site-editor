---
title: Drops into an instance's items slots
type: task (AFK)
status: open
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
