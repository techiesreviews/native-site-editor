---
title: "Media search waits for a pause in typing"
type: task (AFK)
status: closed
assignee: runner-91
builder: sol
landed: "PR #117 (c1788f5)"
blocked_by: []
---

## Goal

Research 02 (media follow-up): every search keystroke redraws every Media tile (`drawLibraryGrid`, `src/page-builder/media-library-grid.ts`; called from `media-library-input.ts:17` with no pause), about 100 ms per 1,000 tiles.

## Decided behaviour

[Ticket 04](../../tickets/04-grill-debt-and-fix-choices.md#resolution-2026-10-22): **Media search waits for a pause in typing.** Lead decision: the grid redraws about 150 ms after the last keystroke; Enter, clearing the search and leaving the field redraw at once; the "N of M files" count follows the redraw. Focus and the caret stay in the search field.

## Files

- `src/page-builder/media-library-input.ts`, `tests/media-library-input.test.ts` (fake timers: three quick keystrokes, one redraw; Enter redraws at once; the timer is cleared when Media closes)
- `src/page-builder/media-library-view.ts` only if the timer must be cleared on close there

## Done when

- Typing in the Media search redraws the grid once, about 150 ms after the last keystroke; Enter, clearing the search and leaving the field redraw at once; the "N of M files" count follows the redraw; focus and the caret stay in the search field; the pending timer is cleared when Media closes.
- `native-media-library.spec.ts` and `native-media-library-keys.spec.ts` green unchanged (they wait on observable state).
- No `main.ts` change. `npm run check`, `npm test` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Free-model candidate once T3 lists a verified zero-cost model; until then Sol.

- `kit doctor`; `kit bg slice-91 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/91-media-search-pause.md --builder sol`; `kit wait job slice-91 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected` plus `kit specs native-media-library.spec.ts native-media-library-keys.spec.ts`.
- Review: `kit review --ticket <this ticket>` (GPT-6.1 Sol, medium, read-only). Land: `kit pr --ticket <this ticket>`.
- Report: unit and specs `RESULT:` lines, review folder and decisions, PR and merge SHA.

## Done (2026-10-22)

- Media search redraws the grid and file count 150 ms after the last keystroke. Enter, clearing the search and leaving the field apply the search immediately. Redrawing preserves the search field, focus and caret.
- Closing Media clears the pending search timer through the view's existing abort signal.
- Added fake-timer tests for three quick keystrokes producing one redraw, Enter, clearing, blur and closing Media. `kit unit --affected` passed 1,268/1,268 tests; the full unit suite through `kit unit` passed 4,930/4,930 tests. `npm run check` and `npm run lint` passed. The unchanged `native-media-library.spec.ts` and `native-media-library-keys.spec.ts` passed all 15 browser tests through `kit specs`.
- Touch taps while search is pending keep the pressed tile until its synthesized click runs, even when focus leaves the search after pointerup. A release without a click still redraws through the existing fallback.
- Added a touch-enabled browser test for opening details on the first tap and a fake-timer regression for pointerup before blur; both reproduced the lost activation before the fix. The no-click fallback test also covers blur after release. For this correction, `kit unit --affected` passed 1,274/1,274 tests; `npm run check` and `npm run lint` passed; `kit specs native-media-search-pause.spec.ts native-media-library.spec.ts native-media-library-keys.spec.ts` passed all 19 tests across three specs.
- A tile pressed while the search waits keeps its element until its whole click has run (a checkbox's change and a label's second click included); the redraw follows on the next turn. A press released anywhere on the page without a click redraws 150 ms later. Enter with no search waiting, or inside an IME composition, redraws nothing.
- Added browser spec `tests/native-save/native-media-search-pause.spec.ts` (paused page clock): the 150 ms pause with focus and caret kept; Enter, clearing and Tab applying at once with the count; first click or tap on a thumbnail; selection by box and by round; a press released outside Media. `kit specs native-media-search-pause.spec.ts native-media-library.spec.ts native-media-library-keys.spec.ts`: 21/21 passed. `kit unit tests/media-library-input.test.ts`: 15/15.
- Commits (subjects; SHAs change when the PR rebases): "Media search waits for a pause in typing" (Sol), "Review fixes round 1" and "Media search redraws after a pressed tile's whole click" (Claude), "Review fixes round 2" (Sol), "Review fixes round 3" (Claude).
- Review decisions: round 1 (Sol) P1 lost click, fixed inside `media-library-input.ts` by holding the redraw until the click finishes rather than keeping tiles in place (that is ticket 92's scope); round 1 re-review P1 lost selection, fixed by deferring the redraw past the click; round 2 P1 touch tap, fixed; round 3 (Claude, Sol at its usage limit) two P3s and the validation gaps, fixed.

### Follow-ups

- Standards (P3): 87b2f80f:tests/media-library-input.test.ts:106 — P3: The fake `search` and `page` objects, plus the `uploadInput` and `dialog` fakes at `:111`, are typed by a p
- Validation gaps (gap): Leaving the field by mouse is not tested in a browser. Only Tab is covered (`native-media-search-pause.spec.ts:392-396`); the mouse path is checked only by a un
- Validation gaps (gap): The Tab test does not check where focus goes. `:396` only asserts that some button in Media has focus. Test to add: also assert that focus is on the button that
- Validation gaps (gap): No unit test for typing during a press. Covering this pins the `pressing = false` reset at `media-library-input.ts:26`. Test to add: `type("cat")`, `grid.dispat

