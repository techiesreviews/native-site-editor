---
title: "Image popup: find and fix the flicker while zooming or moving"
type: task (AFK)
status: closed
assignee: runner-93
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

## Done when

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

## Done (2026-10-22)

**Cause.** Every zoom, turn or move step sends one `image-look` per frame. The canvas handler (`setImageLook` in `src/components/native-preview-runtime.js`) first put all of the image's own attributes back (its own `src` and `style`), then set the new trimmed picture. So between two steps the image was given its uncropped picture and then a new data address it still had to decode; the browser kept drawing the image's own picture, in the trim's style, until the new one was ready: the flick back and jump Lex saw. Evidence: on `dev` each step calls `setAttribute("src", <own picture>)` before `setAttribute("src", <next trim>)`. The new spec records every `src` set on the page's image; run against the `dev` runtime and popup view it fails (`kit specs native-image-popup.spec.ts`: `RESULT: fail specs 1 of 1 failed`, at the assertion that the own picture, a `data:image/webp` address, never returns after the first trim). With the fix it passes (`RESULT: ok specs 1/1 passed`, 22 tests in the file).

**Behaviour.** A new look on the same image changes only what differs: attributes it keeps setting are not put back in between, and only ones it no longer sets come back. A new picture is decoded first (`Image.decode`) and then shown together with its style, so the trimmed picture already showing stays until the next one can be drawn. If a later look shows first, the older one is dropped. A page render still puts the image's own attributes back and reads them again, as before. Closing the popup still gives the image its own attributes back. In the popup's small previews, a picture that may be see-through keeps its checkerboard mark until the new trim has loaded, so it no longer flashes on each step.

**Tests.** `tests/native-save/native-image-popup.spec.ts`: "zooming and moving step by step never shows the page's own picture between steps": six Zoom steps and a dot drag in three moves on a raster picture, each move waiting for its own trim. It asserts the same element, that the page's own `src` never comes back after the first trim, and that more than one trimmed picture was shown. A second test, "a trim that decodes late never replaces a newer one, nor the picture once the popup has closed", holds every decode in the preview: nothing shows before a trim decodes, the newest trim released first stays when older ones are released after, and a trim still decoding at Close never reaches the page. With the stale-look guard removed it fails. No rule moved, so there are no new unit tests. Ran: `npm run check` ok, `npm run lint` ok, `kit unit --affected` `RESULT: ok unit 1263/1263`, the spec above. `kit shots image-popup --compare dev`: no difference at rest in the popup or on the page; the Computer preview thumbnail's scale varies between runs on `dev` itself (light before vs dark before).

**Files.** `src/components/native-preview-runtime.js` (the `image-look` handler and its render caller), `src/page-builder/image-popup-view.ts` (`showPicture`). No `main.ts` change.

**Build note.** The Claude builder CLI in `kit slice` could not run any Bash command (kit, npm, node all refused for approval), so it wrote the change unverified; runner-93 (Claude Opus 5.5) verified and finished it directly, per runner.md's `builder: claude` fallback.

**Review.** Round 1 (`kit review`, GPT-6.1 Sol, evidence `.scratch/reviews/runner-93/20261022T083216Z` in the main checkout): no defects; two validation gaps, both fixed in `test: each zoom step reaches the page; late decodes never win` (each zoom step now waits for its own trim; the held-decode test covers reverse order and Close). Round 2 could not run: Codex reported its usage limit is reached until 2026-10-27 (`.scratch/reviews/runner-93/20261022T084611Z/run.log`). `kit pr --dry-run` on the rebased branch: check, unit, lint and the full spec set ok.
