---
title: "Undo of Make component keeps the component's stylesheet pane (flaky on dev)"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [14-agent-tools-see-and-say]
---

## Goal

`tests/native-save/native-guarded-history.spec.ts`, "Undo of Make component closes the new component's stylesheet pane", fails now and then on plain `dev` (1 in 6 alone) and more often under load: after Make component the stylesheet pane should show the new component's stylesheet but sometimes shows `styles/site.css`. It stopped slice 14's `kit pr` three times, so slice 14 listed it in `tests/known-failures.json` (lead, 2026-10-29). Slice 14's read (not confirmed): on return from the component, the pane opens the component's stylesheet, then a late selection update switches it to `site.css`.

## Decided behaviour

- Returning from a component owns the stylesheet pane until the selection update it caused has arrived; a late update from before the return never switches the pane.
- The test leaves `tests/known-failures.json`.

## Files

- `src/controllers/linked-styles-controller.ts` and its unit tests
- `tests/known-failures.json` (remove the entry), `tests/native-save/native-guarded-history.spec.ts` only if the test itself needs a fix

## Done when

- A unit test reproduces the late update and fails before the fix.
- The spec passes 20 runs in a row alone and under `kit specs` load.
- `kit unit --affected`, `kit specs --affected`, `kit doctor` pass.

## Kit commands and evidence

`kit doctor`, `kit slice --ticket <this> --builder claude-opus-5-5`, `kit unit --affected`, `kit specs --affected`, `kit review`, `kit pr`; report the RESULT lines and the 20-run count.
