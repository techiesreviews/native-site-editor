---
title: "Image popup: find and fix the flicker while zooming or moving"
type: task (AFK)
status: open
assignee: claude runner (lead: this session)
builder: claude
blocked_by: []
---

## Goal

A defect Lex found ([ticket 04](../../tickets/04-grill-debt-and-fix-choices.md#comments), round 1): editing an image with the edit bar's Image popup, for example zooming in and moving the picture to the side, redraws the image and it flickers. Diagnose first, then fix.

## Decided behaviour

[Ticket 04](../../tickets/04-grill-debt-and-fix-choices.md#resolution-2026-10-22): the Image edit bar's redraw and flicker while zooming or moving goes into the plan as a diagnose-and-fix slice. While Lex zooms, turns or moves a picture in the Image popup (and in the large editor), the picture on the page and in the popup's previews changes smoothly, with no blank frame, no reload of the picture and no jump. What each change does is unchanged (the popup applies at once; closing writes one Undo step).

## Where to look (not a diagnosis)

The popup shows each change at once through an `image-look` message to the preview (`src/components/native-preview-runtime.js` around 3825), and the popup draws its own previews (`src/page-builder/image-popup-view.ts`, `trimmedPreview`, `loadPicture`). Candidates: the look replacing the image's `src` or element on each step, a new object URL per step, previews rebuilt per input event, or a draft write and preview repaint per step.

## Files

- Diagnosis touches nothing. The fix is expected in: `src/page-builder/image-popup.ts`, `src/page-builder/image-popup-view.ts`, `src/page-builder/image-large-editor.ts`, `src/page-builder/place-frame.ts`, `src/components/native-preview-runtime.js` (the `image-look` handler). Another file: stop and say so in `decide`.
- Tests: a browser spec in `tests/native-save/native-image-popup.spec.ts` that zooms and moves through several steps and asserts the picture element and its `src` stay the same (or no load event fires) between steps; unit tests for any rule moved into `image-popup-rules.ts` or `image-popup-trim.ts`

## Acceptance checks

- The Done section names the cause with evidence (a recorded trace, an event count or a spec that failed on `dev`).
- The new spec fails on `dev` and passes after the fix.
- `kit shots image-popup` before and after (`--compare dev`); no visible difference at rest.
- No `main.ts` change. `npm run check`, `npm test`, `kit specs --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Use `mattpocock-skills:diagnosing-bugs` (and `debug-animation` if the cause is a visual transition).

- `kit doctor`; `kit bg slice-93 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/93-image-popup-flicker.md --builder claude-opus-5-5`; `kit wait job slice-93 --timeout 2h`.
- `kit specs native-image-popup.spec.ts` to reproduce; then `kit unit --affected`, `kit specs --affected`, `kit size` if the runtime grows.
- `kit shots image-popup --compare dev`.
- Review: `kit review --ticket <this ticket>` (GPT-6.1 Sol, medium, read-only); an Opus 5.5 UX look at the result on request. Land: `kit pr --ticket <this ticket>`.
- Report: the cause and its evidence, shots contact sheet, unit and specs `RESULT:` lines, review folder and decisions, PR and merge SHA.
