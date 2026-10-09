---
title: "Refusal reasons show on screen"
type: task (AFK)
status: open
assignee:
blocked_by: []
builder: sol
phase: 4
---

## What

From slice 72 (see its Done note): when an action is refused (Undo/Redo refused, a drop or click-insert refused, Make component or a slot change refused, a stale page), the reason goes only to the `#status` live region, which isn't visible in this layout. Show it on screen as well: a small, non-blocking note near where the action happened (by the edit bar for selection actions, by the undo/redo buttons for history, by the pointer for drops if the drop label isn't already showing it), readable in light and dark, gone after a few seconds or on the next action, and still announced through `#status`. One shared helper used by every place that writes a refusal today.

## Done when

- Unit test for the helper; nightly spec: a refused Redo (slice 72's case) and a refused click-insert both show their reason on screen and in `#status`.
