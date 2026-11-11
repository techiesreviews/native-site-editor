---
title: "Parts: Spinner, Progress bar"
type: task (AFK)
status: closed
assignee: fleet-lead
builder: claude
blocked_by: [05-catalogue-board, 04-one-offs-count]
---

## Goal

Add the Spinner and Progress bar to the board as catalogue parts. This slice adds them only; it does not replace copies in the editor (that waits for Lex's Approve, slice 34).

## Decided behaviour

- Built as plain TypeScript functions with options, one class per part, variants as data attributes, slots as arguments ([ticket 11](../../tickets/11-grill-extendable-parts.md#resolution-2026-10-25)).
- Options and merges from research 04's proposal (`git show origin/research/ac-04-parts-inventory:docs/wayfinder/atomic-catalogue/research/04-parts-inventory.md`, "Proposed catalogue" and "Spinner and progress (missing)"): Spinner sizes, inline or overlay; Progress bar known or unknown; reduced motion respected.
- Uses only shared tokens (slices 02 and 03); every state on the board (normal, hover, pressed, focus, disabled, busy where it applies), light and dark, 390 and 1280 wide.
- Registered in `src/catalogue/parts.ts`.
- Mock-up approved by Lex (2026-10-27, "the after is great"): [10-first-parts-and-edit-bar.html](../../prototypes/10-first-parts-and-edit-bar.html)

## Files

Expected: `src/ui/parts/` (new modules for these parts, confirm the folder in decide), their CSS, `src/catalogue/parts.ts`, unit tests for each function's options.

## Done when

- Each part renders every option and state on the board; unit tests pin the options-to-markup mapping.
- No editor screen changes yet (`kit shots --compare dev` of two editor screens shows nothing new).

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-ac-14 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-ac-14 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit shots` of the part's frame on the board (`/catalogue.html`), light and dark, 390 and 1280 wide; the lead shows Lex the sheet, and Lex approves on the board.
- The one-offs count (slice 04, once landed) does not rise; quote its `RESULT:` line.

## Done (2026-11-11)

- **Spinner:** `src/ui/parts/spinner.ts` draws one `span.spinner` from `src/ui/parts/spinner-options.ts` (plain data in, attributes out). Options: `size` (small, medium or large; anything else is medium), `place` (inline, or overlay that fills the nearest positioned parent with a veil and the ring in the middle; anything else is inline) and `label` (what assistive technology says; blank is "Loading"). One class, the variants as data attributes, `role="img"`. `src/ui/parts/spinner.css` uses only shared tokens: sizes are `--space-s`, `--space-m` and `--space-l`, the ring's line is `--space-4xs` in `--control-line` with `--primary` on top, the turn is `--dur-fly` times 1.5. With reduced motion it turns slower (`--dur-fly` times 4), never stops, as in the approved mock-up.
- **Progress bar:** `src/ui/parts/progress.ts` draws one `span.progress` from `src/ui/parts/progress-options.ts`. Options: `value`, `max` (default 100) and `label` (blank is "Progress"). A number makes it known: the value is kept between 0 and `max`, 0 counts as known, and `aria-valuemin`, `aria-valuemax` and `aria-valuenow` are set; the fill is as wide as the percentage. Anything else (missing, blank, not a number) makes it unknown: no value attributes, and a short bar slides along the track (`--dur-fly` times 2; slower, not off, with reduced motion; runs the other way right to left). A bar that is already drawn is moved with `setProgress(bar, options)`, and its fill then grows over `--dur-menu` (not at all with reduced motion); the board redraws a cell as a new bar on each change, so it jumps there. It fills the width it is given. `src/ui/parts/progress.css` uses only shared tokens.
- **The board:** `src/catalogue/parts.ts` registers both as atoms. The Spinner card has rows Inline and Overlay and columns Small, Medium and Large, with controls Size, Place and Label; the overlay sits over a stand-in block of words. The Progress bar card has rows Unknown, Not started, 30%, 60% and Done, with controls Amount and Label. Both show light and dark. Neither has a hover, pressed, focus, disabled or busy look of its own (they are the busy sign, and nobody can touch them), so each has one Normal column or the sizes. `src/catalogue/board.css` gains the two stage boxes.
- **Tests:** `tests/spinner-progress-parts.test.ts` pins sizes, places, labels, value clamping, max, known and unknown markup, and that each board card offers every size, place and amount and its options reach the part. A spec in `tests/native-save/native-catalogue-board.spec.ts` drives both live cells: Size and Label change the ring's data and name, its `::before` measures 24 px at Large and turns; Overlay covers its block corner to corner; the Progress bar's fill measures 0.6 at 60%, and Unknown drops the value attributes and slides.
- **No editor screen changes:** no editor code calls the new parts yet, so the swap waits for Lex's Approve (slice 34). Nothing the editor loads imports them, so boot did not change.
- **Evidence:** `kit unit --affected` RESULT: ok unit 28/28 (3 files); `npm run check` RESULT: ok tokens in step; `npm run lint` check-exports: 15 unused export(s), 0 failure(s); `kit specs tests/native-save/native-catalogue-board.spec.ts` RESULT: ok specs 1/1 passed; `kit size` RESULT: ok size boot 354 KB (±0 KB) vs dev@69e4f6b, budget 355 KB; one-offs RESULT: ok one-offs 1578 hand-typed values in 68 files, none above scripts/agents/one-offs.json. `kit shots` of both cards on the board, light and dark, at 1280 and 390 wide, looked at (RESULT: ok shots 4 files, 0 failed each): the findings listed are the selected title's colour, and the Button and Inline field cards cut off beside them, none in the new cards. `kit shots editor pages --compare dev --width 390,1280` RESULT: ok shots compare dev@69e4f6b: base 0 cached, 8 shot; after ok; 38 files; seven of the eight pairs are byte for byte the same, and the eighth (pages, 1280, dark) differs by one pixel, unrelated to this change (nothing the editor loads changed).
- Feature list: no change (the board is on the preview editor only and no editor screen changed)

### Review fixes (2026-11-11)

- **Moving a bar (P2, fixed):** `src/ui/parts/progress.ts` exports `setProgress(bar, options)`, which re-applies the options to a bar already on the page; going from known to unknown removes `aria-valuemin`, `aria-valuemax`, `aria-valuenow` and `--progress`. `progress()` calls it. The fill is now worked out by `progressPercent` and no longer written into the markup as `data-percent`.
- **Overlay and docs (nits, fixed):** the overlay sits on `--layer-raised` so later positioned children do not paint over the veil; the `spinner.ts` header says the overlay is for panels and blocks and that the caller marks the host `aria-busy="true"` and `inert`. The board's Spinner labels are written out in records like the Icon's, and the overlay spec checks width and height one by one.
- **Tests:** `tests/spinner-progress-parts.test.ts` pins `progressPercent` and the markup without `data-percent`. Three new specs in `tests/native-save/native-catalogue-board.spec.ts`: a bar moved from 30 to 60 to unknown (values follow, the fill is between the two widths one frame after the move, value attributes go in the unknown state); reduced motion (Spinner turn 2.4s and still turning, unknown slide 3s and still sliding, known fill transition 0s); right to left (the known fill starts at the right end, the unknown slide is `progress-slide-rtl`).
- **Evidence:** `kit unit --affected` RESULT: ok unit 29/29 (3 files); `npm run check` RESULT: ok tokens in step; `npm run lint` check-exports: 15 unused export(s), 0 failure(s); one-offs RESULT: ok one-offs 1578 hand-typed values in 68 files, none above scripts/agents/one-offs.json; `kit specs tests/native-save/native-catalogue-board.spec.ts` RESULT: ok specs 1/1 passed (23 passed).
- Declined: none of the findings.

### Follow-ups

- Standards (P3): ec6fd9040:tests/native-save/native-catalogue-board.spec.ts:666 — P3 race: the growing check waits two animation frames, then expects the fill to be under 120 px. The transition only lasts `--dur-menu` (200ms, `src/theme.css:251`). If a slow CI machine pauses for 200ms between `setProgress` and the second frame, the fill reaches 120 px and the test fails even though the code is right. This matters under "Wait on observable state; document deliberate fixed waits" (CODING_STANDARDS.md, Browser specs). Fix: set the transition to a long time for this test only, for example `bar.style.setProperty("--dur-menu", "5s")` before the move. Or change the check to "greater than 60" plus "not yet at its end" by reading `getAnimations()` on the pseudo-element. Either way, a slow frame can no longer turn the check into a pass or fail by chance.

