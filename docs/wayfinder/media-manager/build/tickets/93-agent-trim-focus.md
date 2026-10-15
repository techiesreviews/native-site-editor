---
title: Agents' trims treat the focus point as the popup does
type: task (AFK)
status: in progress
assignee: claude (mm-93 runner)
blocked_by: [92-agent-frame-component-shapes]
builder: sol
phase: 3
---

## What

Follow-up from slice [92](92-agent-frame-component-shapes.md#done-2026-10-15) (its rejected review finding). Map ticket [13](../../tickets/13-what-agents-may-do.md#resolution-2026-10-13) says agents write exactly what the editor writes, but a trim through `frame_image` (slice [45](45-agents-frame-and-trim.md)) keeps the place's focus point, while the image popup's Done (slices [41](41-popup-trim-zoom-turn.md)/[42](42-large-editor.md)) centres it.

The popup's rule after a trim (`trimFocus` in `src/page-builder/image-popup.ts`): the copy is cut to the shape the place shows, so the focus goes to the middle (`object-position` removed). Only where the copy's proportions differ from the shape the place keeps (a re-opened Free trim kept inside the place's own shape, `around`) does the place's own focus stay.

- An agent trim without `focus` writes the focus as the popup's Done would for the same result: centred when the copy's proportions match the shape the place shows after the trim (the given `shape`, else the place's own or its component's shape; Original always), the place's own focus when they differ (within the popup's 1 % tolerance).
- An explicit `focus` with a trim is still written as given.
- Component shapes (slice 92) and Original under a component keep working.
- The Media chapter in `worker/site-conventions.ts`, `docs/mcp.md` and the starter's `AGENTS.md` say what happens to the focus point after a trim (starter flow as slices 22/37/45/55/92: starter `dev`, `fixtures/actual-starter`, vendored copy, drift test).
- If small: `tests/native-save/native-file-ops.spec.ts` "Files keyboard delete/restore" flakes about 1 in 4 on dev since slice 09; find the race and make it reliable (no sleeps), else note it.

## Done when

- `tests/mcp-runtime.test.ts`: an agent trim of a place with a moved focus point gives exactly the page text of the popup's Done for the same trim (focus centred), with and without `shape`; a trim whose copy differs from the place's shape keeps the focus, as the popup's `around` case; the existing agent-vs-popup equality tests still pass.
- The focus rule is a pure, unit-tested function.
- `tests/agents-md-drift.test.ts` passes after the starter refresh.
