---
title: "Slot plan: repeated groups and lists"
type: task (AFK)
status: closed
assignee: claude (slice runner)
blocked_by: [07-slot-plan-whole-elements]
builder: claude ★
phase: 2
---

## What

Ticket [03](../../tickets/03-default-editables.md) §5, with the [04](../../tickets/04-prototype-making-components.md) §10 amendment.

- Two or more siblings with the same tag and the same first class become the unnamed slot; the items stay plain HTML (or instances) in the page. Only the first group is unnamed; later groups are `items-2`, `items-3`.
- An items slot is the unnamed slot, or a slot whose fallback is a card component (decided at handoff, 5); slice 10 makes every group's fallback a card component, so a renamed or later group (`items-2`) still counts. A slot holding one other nested instance is an ordinary slot.
- A `<ul>`/`<ol>` becomes one named slot, `list`; its `li` are not slots of their own.
- Reuse the repeated-run detection in `src/page-builder/card-grid.ts` (`itemKind` `:31`, `repeatedRun` `:45`) where it fits.

## Done when

- Unit tests: a card grid becomes the unnamed slot with the cards in the page; a second group is `items-2`; one item alone is not a group; a list becomes `list`; a renamed items slot keeps its items role once its fallback is a card component.

## Done (2026-10-09)

- `makeComponentPlan` turns two or more consecutive siblings of one item kind (`itemKind` on tag + first class; custom elements by tag) into an empty items slot, the items moved to the page as written: the first group unnamed, later ones `items-2`, `items-3`; `PlannedSlot.items` lists each item's path. Lines of text, standalone links and images stay slots of their own, never a group; text between items breaks a run. `<ul>`/`<ol>` is one `list` slot; a list made a component has its `li`s as the group. `TemplateSlot.items` marks an items slot: unnamed, or a fallback of `card-…` instances only.
- Commit "Slot plan: repeated groups and lists" and two review-fix commits on `dev`. Items move with what lay between them (white space, comments); a named group loses white space between inline items, since text only ever goes to the unnamed slot.
- Tests in `tests/component-model.test.ts`: card grid, the starter's Recent work, later groups, single items, text-split and comment-separated runs, lists, list as root, a renamed and a fixed group, the template items role.
