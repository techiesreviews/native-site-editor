---
title: Names made valid as typed
type: task (AFK)
status: open
assignee:
blocked_by: []
builder: sol
phase: 3
---

## What

Ticket [04](../../tickets/04-prototype-making-components.md) §4: component and slot names are made valid as typed, with no warnings.

- A pure function: lowercase, a space becomes a hyphen, anything else invalid is dropped, hyphens collapse, no leading hyphen or digit; a trailing hyphen stays while typing and is trimmed when committed. Tags also pass `tagNameProblem` (taken names, reserved names).
- A small helper that normalises a text field or a contenteditable chip in place and keeps the caret where it was in the text.
- A name with no hyphen cannot be a tag: open point 9 in the [spec](../spec.md).
- Prototype: `prototype/cb-04-make-component`, `src/prototype/cb04-core.ts:196-205` (`normaliseName`, `normaliseInput`).

## Done when

- Unit tests: case, spaces, dropped characters, collapsed and trailing hyphens, leading digits, a taken tag, caret position.
