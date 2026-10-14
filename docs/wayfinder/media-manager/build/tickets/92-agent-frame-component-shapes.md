---
title: Agents' frame_image knows component shapes
type: task (AFK)
status: open
assignee: claude (mm-92 runner)
blocked_by: [43-component-shapes]
builder: sol
phase: 3
---

## What

Follow-up from slice [43](43-component-shapes.md#done-2026-10-15). Agents' `frame_image` (slice [45](45-agents-frame-and-trim.md)) does not know component shapes: on a page image slotted into a component whose own CSS gives its picture a fixed shape, `shape: "original"` removes the inline shape, so the component's shape still shows, and reading the place reports Original instead of the component's shape.

Make `frame_image` use slice 43's component-shape reader (`src/page-builder/component-shapes.ts`) exactly as the image popup does:

- Reading a place reports the component's shape (its label and ratio) when the component's shape is what shows; a place with its own shape reports that shape, as today.
- `shape: "original"` on such a picture shows the whole picture (`aspect-ratio: auto; object-fit: contain`, as the popup's Original), and reads back as Original.
- Choosing the component's shape again (a new `shape: "component"`) removes the place's own shape and keeps the focus. Refused where the picture has no component shape.
- Trims keep working: a trim with Original under a component shows the copy whole; a trim with the component's shape leaves the component to crop it.
- The Media chapter in `worker/site-conventions.ts` and the starter's `AGENTS.md` say so (starter flow as slices 22/37/45/55: starter `dev`, `fixtures/actual-starter`, vendored copy, drift test).

## Done when

- `tests/mcp-runtime.test.ts`: on a shaped component's picture, the agent's read, Original, the component's shape and a trim give exactly the page text (and report) of the popup's path; the agent-vs-popup equality tests cover the component case; `shape: "component"` without a component shape is refused.
- `tests/agents-md-drift.test.ts` passes after the starter refresh.
