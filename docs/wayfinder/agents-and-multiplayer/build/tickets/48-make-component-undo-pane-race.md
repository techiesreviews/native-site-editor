---
title: "Done while Edit component mode still loads returns to the new component and its stylesheet (flaky on dev)"
type: task (AFK)
status: closed
assignee: am-48
builder: claude
blocked_by: [14-agent-tools-see-and-say]
---

## Goal

`tests/native-save/native-guarded-history.spec.ts`, "Undo of Make component closes the new component's stylesheet pane", fails now and then on plain `dev` (1 in 6 alone) and more often under load: after Make component the stylesheet pane should show the new component's stylesheet but sometimes shows `styles/site.css`. It stopped slice 14's `kit pr` three times, so slice 14 listed it in `tests/known-failures.json` (lead, 2026-10-29). Slice 14's read was a late selection update; the first build found the real cause instead: Done pressed while Edit component mode is still loading returns to the page with nothing selected, so the page's shared stylesheet stays beside it. A real person clicking Done quickly hits it, so the product is fixed (lead, 2026-10-30: ticket widened).

## Decided behaviour

- Done during loading still re-selects the new component on the page and shows its stylesheet.
- No mode starts late after that Done.
- The test leaves `tests/known-failures.json`.

## Files

- `src/page-builder/component-mode.ts`, `src/page-builder/components.ts` and their unit tests (`tests/component-mode.test.ts`)
- `src/controllers/linked-styles-controller.ts` and its unit tests (only if the pane itself needs a fix)
- `tests/known-failures.json` (remove the entry), `tests/native-save/native-guarded-history.spec.ts`
- `docs/agents/features.md` (F-component-03's Good line)

## Done when

- A unit test and a spec click Done mid-load and fail before the fix. The spec does not wait for the mode before Done.
- The first build's "a unit test reproduces the late update" item is dropped: there is no late update. `linked-styles-controller.ts` links what it is told; the selection never came back.
- The spec passes 20 runs in a row alone and under `kit specs` load.
- `kit unit --affected`, `kit specs --affected`, `kit doctor` pass.

## Kit commands and evidence

`kit doctor`, `kit slice --ticket <this> --builder claude-opus-5-5`, `kit unit --affected`, `kit specs --affected`, `kit review`, `kit pr`; report the RESULT lines and the 20-run count.

## Done (2026-10-30)

- Cause, from console traces of 15-run repeats (3 of 15 failed before any change): no late selection update switches the pane. The spec clicked Done while Edit component mode was still loading. `mode.leave()` cancelled that entry and returned no instance, and a stale `refresh` selection of the page, refused once the template is open, had already cleared the selection. So `backToPage` (src/page-builder/components.ts) selected nothing back on the page, and the pane kept the page's default `styles/site.css`. In passing runs the mode came on first and the return selected the instance, which linked the component's stylesheet.
- Fix: `leave()` (src/page-builder/component-mode.ts) hands back the instance of an entry still loading (the latest entry wins over a mode already on), and only until that entry settles. `backToPage` already selects what `leave()` returns, so components.ts is unchanged; the selection links the component's stylesheet through `linked-styles-controller.ts`, also unchanged.
- The first build's wait for the mode's title before Done is gone again: the fix makes it unneeded.
- Tests: tests/component-mode.test.ts "leave (Done) while the first entry still loads … returns its instance, once" (fails before the fix: `undefined`), "leave (Done) after an entry settled without the mode returns nothing", and the existing "leave (Done) during an entry's load" now asserts the loading instance. tests/native-save/native-guarded-history.spec.ts "Done while the new component's mode still loads …" holds the mode's view with `page.route`, clicks Done, and expects the component selected and its stylesheet beside it (fails before the fix: nothing selected). `tests/known-failures.json` is empty.
- Feature list: F-component-03's Good line says Done returns to the instance with its stylesheet, even while the mode loads.
