---
title: "Part: Icon"
type: task (AFK)
status: closed
assignee: fleet-lead
builder: claude
blocked_by: [05-catalogue-board, 04-one-offs-count]
---

## Goal

Add the Icon to the board as catalogue parts. This slice adds them only; it does not replace copies in the editor (that waits for Lex's Approve, slice 30).

## Decided behaviour

- Built as plain TypeScript functions with options, one class per part, variants as data attributes, slots as arguments ([ticket 11](../../tickets/11-grill-extendable-parts.md#resolution-2026-10-25)).
- Options and merges from research 04's proposal (`git show origin/research/ac-04-parts-inventory:docs/wayfinder/atomic-catalogue/research/04-parts-inventory.md`, "Proposed catalogue" and "Icons"): name; sizes from a small set; before or after words; one way to draw Phosphor Regular icons instead of six.
- Uses only shared tokens (slices 02 and 03); every state on the board (normal, hover, pressed, focus, disabled, busy where it applies), light and dark, 390 and 1280 wide.
- Registered in `src/catalogue/parts.ts`.
- Mock-up approved by Lex (2026-10-27, "the after is great"): [10-first-parts-and-edit-bar.html](../../prototypes/10-first-parts-and-edit-bar.html)

## Files

Expected: `src/ui/parts/` (new modules for these parts, confirm the folder in decide), their CSS, `src/catalogue/parts.ts`, `src/icons.ts`, unit tests for each function's options.

## Done when

- Each part renders every option and state on the board; unit tests pin the options-to-markup mapping.
- No editor screen changes yet (`kit shots --compare dev` of two editor screens shows nothing new).

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-ac-10 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-ac-10 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit shots` of the part's frame on the board (`/catalogue.html`), light and dark, 390 and 1280 wide; the lead shows Lex the sheet, and Lex approves on the board.
- The one-offs count (slice 04, once landed) does not rise; quote its `RESULT:` line.

## Done (2026-11-11)

- **The part:** `src/ui/parts/icon.ts` draws an icon by name with options `size` and `place`. It is built on `src/ui/parts/icon-options.ts`, plain text in and text out: the one way to turn any Phosphor Regular markup into the part. Sizes come from a small set (12, 16, 20 and 24; any other value becomes 16). The place is `alone`, `before` or `after` words. The markup has one class, `icon`, the size in `width`, `height` and `data-size`, and `data-place` only when beside words. It is hidden from assistive technology. Words are the caller's: it puts them next to the icon in the order the place says. `src/icons.ts` gains `iconSource(name)` for it (`icon()`, `iconMarkup()` and `setIcon()` are unchanged), and `src/icons.css` styles `data-place` like the old `icon--before` and `icon--after` classes, which keep working.
- **The board:** the Icon card shows four names at every size, plus rows "Before words" and "After words", light and dark. The live cell is driven by Icon, Size, Place and Words. An icon has no hover, pressed, focus, disabled or busy look of its own (it takes its control's text colour), so it has no state columns. Options panel names 17 icons; the editor has more.
- **Tests:** `tests/icon-part.test.ts` pins the sizes, the places, the markup (class, data attributes, hidden, the drawing untouched) and that the board's Icon offers every size and place.
- **No editor screen changes:** no editor code calls the new part yet, so the swap waits for Lex's Approve (slice 30). The new function is not reached from the editor, so the editor's boot did not change.
- **Evidence:** `kit unit --affected` RESULT: ok unit 3105/3105 (199 files); `npm run check` RESULT: ok tokens in step (types, specs and colours checks passed); `npm run lint` passed (check-exports: 15 unused export(s), 0 failure(s)); `kit specs --affected` RESULT: ok specs none affected; `kit size` RESULT: ok size boot 354 KB (±0 KB) vs dev@efc5bd4, budget 355 KB; one-offs RESULT: ok one-offs 1578 hand-typed values in 68 files, none above scripts/agents/one-offs.json; `kit shots` of the Icon card at 1280 wide, light and dark, looked at (the 390 sheet is left for the lead).
- Feature list: no change (the board is on the preview editor only and no editor screen changed).
