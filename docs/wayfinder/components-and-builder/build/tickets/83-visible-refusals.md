---
title: "Refusal reasons show on screen"
type: task (AFK)
status: closed
assignee:
blocked_by: []
builder: sol
phase: 4
---

## What

From slice 72 (see its Done note): when an action is refused (Undo/Redo refused, a drop or click-insert refused, Make component or a slot change refused, a stale page), the reason goes only to the `#status` live region, which isn't visible in this layout. Show it on screen as well: a small, non-blocking note near where the action happened (by the edit bar for selection actions, by the undo/redo buttons for history, by the pointer for drops if the drop label isn't already showing it), readable in light and dark, gone after a few seconds or on the next action, and still announced through `#status`. One shared helper used by every place that writes a refusal today.

## Done when

- Unit test for the helper; nightly spec: a refused Redo (slice 72's case) and a refused click-insert both show their reason on screen and in `#status`.

## Done (2026-10-09)

- `refuse(reason, near?)` in `src/components/refusal-note.ts` (+ `refusal-note.css`) writes `#status` and shows a small non-blocking note by the history control (else the edit bar, else the canvas top) or by the pointer for drops; gone after 4 s or the next press (the preview runtime posts `refusal-note-action` on a press in the page). A reason already on screen (the insert flash, the Add panel's position) is not shown twice, unless the edit bar covers it (a selected header's flash), then the note shows below the bar. Undo/Redo refusals surface once from `runVisualHistory` ("Nothing to undo/redo." stays quiet); every refusal that only reached `#status` (moves, stale selections, component, slot, palette, pages, files, media history) goes through it.
- Commits "Refusal reasons show on screen near where the action happened (slice 83)" (Sol built, Claude reworked: no hiding of the flash it does not own, no double history notes, frame keystrokes not posted) and two review fixes (controllers take a `refuse` port; history reasons kept; media and Restore refusals said and anchored).
- Tests: `tests/refusal-note.test.ts` (anchor choice, viewport clamps, dismissal timing); nightly `native-new-component.spec.ts` refused Redo shows the note and `#status`, also with the code pane collapsed; `native-blocks.spec.ts` refused click-insert shows its red flash and `#status`, no second note. A drag released on a refusing target now says the target's reason, by the pointer and in `#status` (`native-block-drag`, `native-block-move` specs updated).
