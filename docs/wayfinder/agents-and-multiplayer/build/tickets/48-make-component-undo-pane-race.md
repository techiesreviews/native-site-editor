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
- Fix: `leave()` (src/page-builder/component-mode.ts) hands back the instance of an entry still loading (the latest entry wins over a mode already on), and only until that entry settles. It hands it back only while the page reads as the entry read it, and only if the entry could read the page at all (the node may be another element after a change); an entry with no instance (Used on → a template) has nowhere to return, so Done goes back to the instance of the mode that is on. `backToPage` already selects what `leave()` returns, so components.ts is unchanged; the selection links the component's stylesheet through `linked-styles-controller.ts`, also unchanged.
- The first build's wait for the mode's title before Done is gone again: the fix makes it unneeded.
- Tests: tests/component-mode.test.ts "leave (Done) while the first entry still loads … returns its instance, once" (fails before the fix: `undefined`), "leave (Done) after an entry settled without the mode returns nothing", and the existing "leave (Done) during an entry's load" now asserts the loading instance. Also "leave (Done) after the page changed under a loading entry does not return its node" (fails without the page check: `[0, 1]` returned) and "leave (Done) with a mode on while an entry with no instance loads returns the mode's instance". Also "leave (Done) while an entry on a page it could not read loads returns nothing" (fails without the check: the node is returned). tests/native-save/native-guarded-history.spec.ts "Done while the new component's mode still loads …" holds the mode's view with `page.route`, clicks Done, and expects the component selected and its stylesheet beside it (fails before the fix: nothing selected). After the release it waits for the view to load (its notes list is on the page) before checking that no mode came on. A second spec, "an agent's page edit while the new component's mode loads …", has an agent put a paragraph above the instance during the load: the edited page comes forward on its own, so no Done is offered, nothing is selected and no mode comes on after the view loads. `tests/known-failures.json` is empty.
- Spec file (all five tests, no wait before Done), after this round's changes: 20/20 in a row alone (100 passed). Spec file (four tests), after the first fix: 20/20 in a row alone; 20/20 in a row while `kit specs` ran native-cards, native-components, native-component-loader and native-make-component from a second checkout beside it (load average 11 to 25). An earlier load attempt from the same checkout stopped at run 12 on another test of the file when both runs shared `.scratch/native-save/results` (a trace file deleted under it), not on this behaviour.
- Kit: `kit doctor` RESULT ok 11/11; `kit unit --affected` RESULT ok 976/976 (38 files); `kit specs --affected` RESULT ok specs 1/1 passed; 89 more run in kit pr (the selection is native-guarded-history.spec.ts); `npm run check` and `npm run lint` ok.
- Feature list: F-component-03's Good line says Done returns to the instance with its stylesheet, even while the mode loads.

### UX follow-ups

- UX (looks off): F-component-03 Edit component mode frames the hero and shows Done, and Done returns to Home with Section hero selected and its stylesheet open, so the flow works; but at 390 px the page picker shows the file path "components/section-hero/section-hero.html", the bar reads "Editing <section-hero>" as a tag name, the site header covers the top of the framed hero so "LARKSPUR STUDIO" is cut off, and the "eyebrow" slot badge in the tree is a tap target under 24 px (.scratch/ux/am-48/20261030-102340-XHHIAZ/add-panel-F-component-03-bug-template-root-actions-390-light-root-strip.webp)

### Follow-ups

- Spec (P2): 97f1090e6:docs/wayfinder/agents-and-multiplayer/build/tickets/48-make-component-undo-pane-race.md:44 — P2 ticket: "Done when" asks for 20 runs in a row both alone and under `kit specs` load. For the final code (five tests, with the page-source check and the fallback for an entry with no instance), the evidence shows only a run alone: "after this round's changes: 20/20 in a row alone". The load run of 20/20 was "after the first fix" with four tests, so the latest `leave()` was never run under load. Fix: run the final spec file 20 times while `kit specs` runs from a second checkout, then replace the evidence line with that count.
- Standards (P2): 97f1090e6:src/page-builder/component-mode.ts:460 — P2 race: `leave()` returns `latest.loading` as long as the page bytes match. It does not check what the entry itself checks in `holds()` (`ports.shown().open === template`, `scopeHolds(stamp)`, the template source unchanged). `loading` is cleared only when the entry settles, and that can take up to `ENTER_DEADLINE` while the view loads slowly. So an entry that is already doomed still steers Done. For example: Make component, then the user opens another component's template from Files while the view is still loading, then presses Done. Done goes back to the old instance instead of the preview page and the current selection. This breaks "Racing and speculative reads → Exactly one path wins; the losing result writes nothing once it is abandoned or superseded by navigation." Fix: keep the entry's `holds` on `Entry` (or the stamp and template source on `loading`), and return `loading` only when `at.holds()` and the page-source check both pass.
- Standards (P3): 97f1090e6:src/page-builder/components.ts:986 — P3 race: `backToPage` reads the `DoneTarget` from `leave()`, then awaits `deps.openFile(page)`, then calls `selectNode` with `edited.node` without checking the page source again. This pattern existed before, but this change sends the loading-entry path through it. That path is the one where agent edits are expected, as the second spec shows. This breaks "Async writers → Proofs survive awaits: re-check that same proof after every await and before every write." Fix: carry `source` on `DoneTarget`, which `loading` already has, and in `backToPage` select only if `peek.source(page) === edited.source` after the await.
- Validation gaps (gap): No unit test presses Done during the first race, while `ports.open` is held and before `mounted`, for an entry that has an instance. Add to `tests/component-mode.test.ts`: `s.m.holdOpen()`, `card(s, [0, 1])`, `await hold.reached`. Then assert that `leave()` returns the instance, that the `mounted` hook never fires after `hold.release()`, that `pending` resolves `stale`, and that `s.live()` is `[]`.
- Validation gaps (gap): No test covers a loading entry whose template is no longer shown, which is the case behind the first Standards defect. Add a unit test: start `card(s, [0, 1], { ready: held })`, wait for mounted, then change the shown open file to another template through the fixture's shown/open port. Assert that `leave()` returns `undefined`, or the mode's instance if a mode is on.
- Validation gaps (gap): No test covers an entry whose repository scope changed while it loads. Add a unit test that bumps the scope stamp during the `ready` wait and asserts that `leave()` does not return the loading instance.

