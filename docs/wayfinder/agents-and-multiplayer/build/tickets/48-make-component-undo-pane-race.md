---
title: "Undo of Make component keeps the component's stylesheet pane (flaky on dev)"
type: task (AFK)
status: closed
assignee: am-48
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

## Done (2026-10-30)

- Cause, from console traces of 15-run repeats (3 of 15 failed before the change): no late selection update switches the pane. The spec clicked Done while Edit component mode was still loading. `mode.leave()` cancels that entry and returns no instance, and a stale `refresh` selection of the page, refused once the template is open, has already cleared the selection. So `backToPage` (src/page-builder/components.ts) selects nothing back on the page, and the pane keeps the page's default `styles/site.css`. In passing runs the mode came on first, its root got selected, and the return selected the instance, which linked the component's stylesheet.
- The spec now waits for the mode's title (`Editing<section-a-native-browser>`) before Done, as native-component-loader.spec.ts does. `tests/known-failures.json` is empty again.
- `src/controllers/linked-styles-controller.ts` is unchanged: it does what it is told, so there is no late update to reproduce in a unit test.
- Not fixed, needs the lead's call (outside this ticket's Files): Done while the mode is still loading returns to the page with nothing selected and the shared stylesheet beside it, the failure this ticket names. The fix: `leave()` in src/page-builder/component-mode.ts hands back the cancelled entry's page, node and tag, so `backToPage` (src/page-builder/components.ts) selects the instance. Tests to add with it: a case in tests/component-mode.test.ts ("leave (Done) during an entry's load ends it too") asserting the returned instance, and a `native-save` spec that holds the mode's load with `page.route`, clicks Done, releases the hold, and expects `index.html`, the instance selected and `components/<tag>/<tag>.css` in the pane. Either this ticket's Files widen to cover them, or they go in a new ticket.
- Spec: 20/20 alone; 20/20 while `kit specs` ran native-cards, native-components and native-component-loader beside it (load average 6.6).
- Feature list: no change (test timing only).
