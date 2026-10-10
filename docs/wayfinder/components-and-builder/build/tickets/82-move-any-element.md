---
title: "Move any element anywhere HTML allows (outside components, and inside the template in Edit component mode)"
type: task (AFK)
status: closed
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

## Done (2026-10-10)

- Moves follow HTML's content rules (`nativeMoveRefusal` in `native-operations.ts`, with reasons such as "A <div> can't go inside a <p>."; `<address>`, `<dt>`, `<th>`, `<picture>`, `<details>` rules too); for a move the probe reports every element and `<main>` takes what HTML allows (a heading straight in); a link moved into text lands after its last word on that line. Slice 33's rule stays: the innermost container that takes it wins, so a Div over a paragraph goes beside it, and a reason shows when nothing under the pointer takes it (an `<li>` over a paragraph). A selected inline element (a link) drags itself. Sections still snap; component insides stay closed on the page.
- Edit component mode: template parts drag on the canvas, by the bar's name and from Structure rows; a named slot moves with the element it holds alone (`templateMovePath`), never into a named slot, a nested component or out of the root (`templateMoveRefusal`); over a named slot a moved part goes beside it; the part stays selected (Undo too). Structure takes rail blocks and moved parts in the mode (`createTemplateStructureDrop`, `templateContainers`). Lead's addition: Alt+arrows move template parts on the canvas and Structure rows by the same rules (`templateKeyMove`).
- Commits 18225a7f, 3abeed2f, 0695361a, 303a957d, 622832fc, ef47b555, 1fcbf5c1 (two Sol reviews). Specs updated for the new rules: `native-block-move` (aim beside the list), `native-structure-drag` (`<main>` takes a heading), `native-cards` (slice 78's Alt+Up moves a card), `native-structure-badges-actual` (Alt+Up on a template row moves it).
- Tests: `tests/move-anywhere.test.ts`, `tests/drop-target.test.ts`, `tests/tree-drop.test.ts`, `tests/block-insert.test.ts`, `tests/block-insert-controller.test.ts`; nightly `native-move-anywhere.spec.ts` (heading into `<main>`, an `<li>` refused over a paragraph with its reason, a Div beside a paragraph, a link into another paragraph, a card's slot refused, a Section snapping) and `native-move-anywhere-actual.spec.ts` (@actual: canvas and Structure moves in Edit component mode, a rail block dropped in Structure, Alt+arrows).
