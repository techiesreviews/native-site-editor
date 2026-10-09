---
title: Heading level from position
type: task (AFK)
status: closed
assignee:
blocked_by: [04-six-block-catalogue]
builder: sol
phase: 4
---

## What

Ticket [10](../../tickets/10-block-set.md) §2 (Heading): directly in a Section a new heading is `h2`; inside a Div within a Section it is one level below the section's heading (`h3`), capped at `h4`; never `h1` by default. The edit bar's level select (`src/controllers/page-structure-controller.ts:147`) changes any heading afterwards.

- A pure function of the source and the target parent path.
- Prototype: `prototype/cb-12-drag-and-drop`, `src/prototype/cb12-core.ts` (`headingLevel` `:345`).

## Done when

- Unit tests: in a Section, in a Div in a Section (with and without a section heading), deeper Divs capped at `h4`, a Section whose heading is `h1`.
