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

Ticket [04](../../tickets/04-prototype-making-components.md) §4 and decided at handoff (9): component and slot names are made valid as typed, with no warnings.

- A pure function: lowercase, a space becomes a hyphen, anything else invalid is dropped, hyphens collapse, no leading hyphen or digit; a trailing hyphen stays while typing and is trimmed when committed.
- A component name without a hyphen gets a prefix from what it was made from: `section-` for a section, `card-` for a card (a repeated item, or a new card component), `block-` otherwise ("services" from a section → `section-services`). A name that already has a hyphen keeps it as typed. The result also passes `tagNameProblem` (taken and reserved names).
- The tag preview (slices 22 and 27) shows the result as typed.
- A small helper that normalises a text field or a contenteditable chip in place and keeps the caret where it was in the text.
- Prototype: `prototype/cb-04-make-component`, `src/prototype/cb04-core.ts:196-205` (`normaliseName`, `normaliseInput`).

## Done when

- Unit tests: case, spaces, dropped characters, collapsed and trailing hyphens, leading digits; the `section-`, `card-` and `block-` prefixes and no prefix when a hyphen is typed; a taken tag; caret position.
