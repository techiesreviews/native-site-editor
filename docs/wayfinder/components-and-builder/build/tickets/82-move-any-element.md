---
title: "Move any element anywhere HTML allows (outside components, and inside the template in Edit component mode)"
type: task (AFK)
status: open
assignee:
blocked_by: [36-blocks-drag-themselves, 37-structure-mirror-and-x-depth]
builder: claude ★
phase: 4
---

## What

Lex (2026-10-09): in the visual page builder and in Structure, any element can be dragged anywhere, not only the six blocks by ticket 10's placement rules:

- **On the page (outside Edit component mode):** any element that isn't inside a component can be moved to any position HTML allows (the content model: e.g. a heading straight into `<main>`, a paragraph into an `<article>`, a link into a paragraph; nothing that makes invalid HTML such as a `<div>` inside a `<p>`). Component instances move as a whole; their insides stay closed, and only their items slots take drops (as now). **Sections still snap between page bands** (Lex's earlier decision, ticket 12 rule 8).
- **In Edit component mode:** any part of the template can be moved anywhere in the template the same way (slots move with their element).
- Inserting a new block from the rail keeps ticket 10's rules (where a new block may go); this slice is about moving existing elements.
- The drop label and refusals follow: refusals now only for invalid HTML (with the reason, e.g. "A <div> can't go inside a <p>"), component insides, and named slots on the page.
- Code pane: edits stay in sync as today (no dragging in the code pane).

Reuse `nativeMoveEdit` / `nativeElementMovePlan` (they already follow HTML content rules, research 11) and slice 33's target model, widening its container set from Section/Div to any element that can hold the dragged one.

## Done when

- Unit tests for the widened target rule (content-model allows/refuses); nightly specs: drag a heading out of a section into `<main>`, a link into another paragraph, a refused `<div>` into a `<p>` with its reason, a component's inside refused on the page but movable in Edit component mode; Sections still snap.

**Also (2026-10-10, from slice 43):** in Edit component mode, Page Structure takes drags too (rail blocks and moved template parts), with the same rules as the canvas in the mode.
