---
title: "Editor: dropping a block under 50 ms, cheaper dragging cursor (TOOLS-261)"
type: task (AFK)
status: closed
assignee: fleet-lead
builder: claude
blocked_by: []
---

## Goal

Lex (2026-11-15): fix "A" for card TOOLS-261 (parent TOOLS-238): make the dragging cursor rule cheaper, so dropping a block in the editor stays under the 50 ms budget of the edit-latency spec on a busy machine. The cursor over some buttons may look slightly different while dragging; nothing else visible may change. The latency budget stays as it is.

## Done when

- The edit-latency spec's "drop a block" has no task over 50 ms, at 2× CPU slowdown and under machine load.
- The edit-latency spec passes 3 times in a row alone and in `kit pr`'s spec run.
- No boot code is added.

## Done (2026-11-15)

- Behaviour: the page-wide rule `.pb-is-dragging, .pb-is-dragging * { cursor: grabbing !important }` and the class it toggled on `<html>` are gone; each drag start and drop restyled every element of the editor. The grabbing cursor now sits on the drag holder alone (`src/page-builder/add-panel.css`), which holds the pointer during a drag started in the editor, and the browser shows the cursor of the element holding the pointer. A drag pressed in the page keeps the page's own cursor, as before.
- Timing (the spec's own numbers, `ASE_LATENCY_REPORT=1`, 3 rounds each): at 2× slowdown, before: longest task 52, 51, 52 ms, next input 67–68 ms; after: no task over 50 ms, next input 30–38 ms. At 1×, before: next input 21–22 ms; after: 14–18 ms. Under 12 extra busy cores at 2×, before: 63, 54, 55 ms; after: no task over 50 ms, next input 29–42 ms.
- Tests: `native-section-drag.spec.ts` and `native-add-panel.spec.ts` check that the drag holder holds the mouse and shows the grabbing cursor; the edit-latency spec failed on dev ("drop a block": 69 and 70 ms) and passed 3 times in a row after.
- Boot: 355 KB, ±0 KB against dev (code removed, none added).
- Feature list: no change (the cursor moved to another element; no feature looks or works differently).
- Commits: "Editor: the grabbing cursor rides on the drag holder, not the whole page (TOOLS-261)", "Editor: the drag spec checks the drag holder keeps the mouse, so its cursor shows (TOOLS-261)", "Editor: the Add panel spec checks the drag holder holds the mouse and shows the grabbing cursor (TOOLS-261)", "Ticket: site-quality 70, dropping a block under 50 ms (TOOLS-261)" and this commit. Editor: the drag spec checks the drag holder keeps the mouse, so its cursor shows (TOOLS-261). Editor: the Add panel spec checks the drag holder holds the mouse and shows the grabbing cursor (TOOLS-261).
