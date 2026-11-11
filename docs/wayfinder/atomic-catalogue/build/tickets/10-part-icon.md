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

- **The part:** `src/ui/parts/icon.ts` draws an icon by name with options `size`, `place` and `words`; beside words it returns one `icon-line` holding the icon and the words in the order `place` says. It is built on `src/ui/parts/icon-options.ts`, plain text in and text out: the one way to turn any Phosphor Regular markup into the part. Sizes come from a small set (12, 16, 20 and 24; any other value becomes 16). The place is `alone`, `before` or `after` words. The markup has one class, `icon`, the size in `width`, `height` and `data-size`, and `data-place` only when beside words. It is hidden from assistive technology. The gap beside words is the shared `--space-3xs`, set on `icon-line`. `src/icons.ts` gains `iconSource(name)` for it (`icon()`, `iconMarkup()` and `setIcon()` are unchanged), and `src/icons.css` styles `data-place` like the old `icon--before` and `icon--after` classes, which keep working.
- **The board:** the Icon card shows four names at every size, plus rows "Before words" and "After words", light and dark. The live cell is driven by Icon, Size, Place and Words. An icon has no hover, pressed, focus, disabled or busy look of its own (it takes its control's text colour), so it has no state columns. Options panel names 17 icons; the editor has more.
- **Tests:** `tests/icon-part.test.ts` pins the sizes, the places, the markup (class, data attributes, hidden, the drawing untouched) and that the board's Icon offers every size and place. A spec in `tests/native-save/native-catalogue-board.spec.ts` drives the live cell: with Before words the icon is the first child and the words follow, with After words the reverse, and alone (or with no words) the stage holds a bare `svg.icon` with no `data-place`; the drawn icon is hidden from assistive technology, carries the chosen `data-size` and measures that size. With no words the board draws the icon alone.
- **No editor screen changes:** no editor code calls the new part yet, so the swap waits for Lex's Approve (slice 30). The new function is not reached from the editor, so the editor's boot did not change.
- **Evidence:** `kit unit --affected` RESULT: ok unit 3105/3105 (199 files); `npm run check` RESULT: ok tokens in step (types, specs and colours checks passed); `npm run lint` passed (check-exports: 15 unused export(s), 0 failure(s)); `kit specs --affected` RESULT: ok specs none affected; `kit size` RESULT: ok size boot 354 KB (±0 KB) vs dev@efc5bd4, budget 355 KB; one-offs RESULT: ok one-offs 1578 hand-typed values in 68 files, none above scripts/agents/one-offs.json; `kit shots` of the Icon card at 1280 wide (light and dark) and at 390 wide (light and dark) looked at: the card sits whole on the screen with the Options sheet open. The layout findings listed are the selected title's colour and the neighbouring Button and Inline field cards being cut off at the screen's edge, none in the Icon card. `kit specs tests/native-save/native-catalogue-board.spec.ts` RESULT: ok specs 1/1 passed.
- Feature list: no change (the board is on the preview editor only and no editor screen changed)
- Done when 1: met — the Icon card on the board shows four names at every size and the Before and After words rows, light and dark; the live cell is driven by Icon, Size, Place and Words (an icon has no hover, pressed, focus, disabled or busy look, so it has no state columns, as the Done above says). `tests/icon-part.test.ts` pins sizes, places and markup, and `kit unit --affected` RESULT: ok unit 3106/3106 (199 files); `kit specs tests/native-save/native-catalogue-board.spec.ts` RESULT: ok specs 1/1 passed; merged in PR #342 (last commit on dev 69e4f6bdb).
- Done when 2: met — no editor code calls the Icon part, and `kit shots editor pages --compare dev --width 390,1280` (both themes) RESULT: ok shots compare dev@efc5bd4: base 0 cached, 8 shot; after ok; 38 files, with all eight before and after pictures byte for byte the same (checked with `cmp`). That compare ran in the first review round, before the PR rounds: later `src/icons.css` edits (the `.icon-line` rules added, the part's own `data-place` margin rules removed, `.icon--before` and `.icon--after` left as they were for the editor's screens) were not shot again, and the shots are not rerun here. `kit size` after those rounds RESULT: ok size boot 354 KB (±0 KB) vs dev@6212872, budget 355 KB; merged in PR #342.

### Review fixes (2026-11-11)

- **Editor screens unchanged:** `kit shots editor pages --compare dev --width 390,1280` (both themes) RESULT: ok shots compare dev@efc5bd4: base 0 cached, 8 shot; after ok; 38 files. All eight before and after pictures are byte for byte the same (checked with `cmp`), although `src/icons.css` changed.
- **Board at 390:** `kit shots` of the Icon card (outline opened from the top bar, then Icon) light: RESULT: ok shots 4 files, 0 failed, 4 layout findings; dark: RESULT: ok shots 4 files, 0 failed, 4 layout findings (findings as above, none in the Icon card).
- **Comment:** `src/ui/parts/icon.ts` now says the words are the caller's to put before or after the icon to match `place`, and the part only sets the spacing (replaced in the PR round: the part now takes the words itself); `icon-options.ts` says the one way is complete once the editor's own copies move over (ticket 30).
- **Board draws what the part normalises:** it reads the place through `iconPlace`, and draws the icon alone when Words is empty, so no spare margin sits beside nothing.
- **Validation:** `kit unit --affected` RESULT: ok unit 3105/3105 (199 files); `npm run lint` check-exports: 15 unused export(s), 0 failure(s); `npm run check` RESULT: ok tokens in step.

### Review fixes, PR round (2026-11-11)

- **Words are an argument (P2, fixed):** `iconPart(name, { size, place, words })` returns the icon and the words as one `icon-line` span in the order `place` says, or the bare icon when there are no words or the place is alone. The `.icon-line` rules (no wrapping, like a control's label) moved from the board into `src/icons.css`; the board's cell just calls the part.
- **One way to draw (P3, fixed):** `drawSvg` in `icon-options.ts` is the one body; `iconSvg` (the part) and `sizedSvg` (the editor's, unchanged output) both call it.
- **Validation gaps (fixed):** the board spec checks the computed gap (0.3 of the font size on the words' side, none on the other) and right to left (Before words puts the icon on the right). Long words: decided on purpose that they stay on one line, like a control's label.
- **Nit, board choices:** the sizes and places on the board come from `icon-options.ts`. Declined: an unknown icon name guard on the board (the options panel only offers bundled names; unchanged from before).
- **Evidence:** `kit unit --affected` RESULT: ok unit 3106/3106 (199 files); `npm run check` RESULT: ok tokens in step; `npm run lint` check-exports: 15 unused export(s), 0 failure(s); `kit specs tests/native-save/native-catalogue-board.spec.ts` RESULT: ok specs 1/1 passed; `kit size` RESULT: ok size boot 354 KB (±0 KB) vs dev@6212872, budget 355 KB.

### Review fixes, PR round 2 (2026-11-11)

- **Shared token for the gap (P2, fixed):** the gap beside words is `gap: var(--space-3xs)` on `.icon-line` (as in the approved mock-up); the part's own `data-place` margin rules are gone. `.icon--before` and `.icon--after` stay as they were for the editor's screens. The icon's own `data-place` stays as data for the board and tests.
- **Ticket text (P3, fixed):** the first Done section now names `words` and `icon-line`.
- **Validation gaps (fixed):** words of only spaces draw the bare icon; the board spec calls `iconPart` itself with an element as words and with Alone plus words. Declined nits: a long-words row on the board and a single list for `ICON_ROWS` (both small, no behaviour changes).

### Follow-ups

- Spec (P3): e1dc90b86:docs/wayfinder/atomic-catalogue/build/tickets/10-part-icon.md:10 — P3 ticket: the line rewritten in this round still says "`src/icons.css` styles `data-place` like the old `icon--before` and `icon--after` classes". This round removed those `data-place` rules (`src/icons.css:8-18` now styles only the two old classes), and the round-2 note at line 30 says so. The Done line now disagrees with the code. Fix: change the end of the sentence to say `data-place` is data only, the gap comes from `.icon-line`, and `.icon--before` and `.icon--after` stay unchanged for the editor's screens.

