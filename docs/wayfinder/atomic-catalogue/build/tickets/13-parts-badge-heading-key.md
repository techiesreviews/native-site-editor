---
title: "Parts: Badge, Section heading, Keyboard key"
type: task (AFK)
status: closed
assignee: fleet-lead
builder: claude
blocked_by: [05-catalogue-board, 04-one-offs-count]
---

## Goal

Add the Badge, Section heading and Keyboard key to the board as catalogue parts. This slice adds them only; it does not replace copies in the editor (that waits for Lex's Approve, slice 33).

## Decided behaviour

- Built as plain TypeScript functions with options, one class per part, variants as data attributes, slots as arguments ([ticket 11](../../tickets/11-grill-extendable-parts.md#resolution-2026-10-25)).
- Options and merges from research 04's proposal (`git show origin/research/ac-04-parts-inventory:docs/wayfinder/atomic-catalogue/research/04-parts-inventory.md`, "Proposed catalogue" and "Badges, counts and tags"): Badge kinds count, status, tag, dot, mark with tones; Section heading with an optional end slot; Keyboard key.
- Uses only shared tokens (slices 02 and 03); every state on the board (normal, hover, pressed, focus, disabled, busy where it applies), light and dark, 390 and 1280 wide.
- Registered in `src/catalogue/parts.ts`.
- Mock-up approved by Lex (2026-10-27, "the after is great"): [10-first-parts-and-edit-bar.html](../../prototypes/10-first-parts-and-edit-bar.html)

## Files

Expected: `src/ui/parts/` (new modules for these parts, confirm the folder in decide), their CSS, `src/catalogue/parts.ts`, unit tests for each function's options.

## Done when

- Each part renders every option and state on the board; unit tests pin the options-to-markup mapping.
- No editor screen changes yet (`kit shots --compare dev` of two editor screens shows nothing new).

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-ac-13 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-ac-13 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit shots` of the part's frame on the board (`/catalogue.html`), light and dark, 390 and 1280 wide; the lead shows Lex the sheet, and Lex approves on the board.
- The one-offs count (slice 04, once landed) does not rise; quote its `RESULT:` line.

## Done (2026-11-11)

- **Badge** (`src/ui/parts/badge.ts`, `badge-options.ts`, `badge.css`): `badgePart({ kind, tone, words, icon })` returns one `span.ui-badge` with the kind and the tone as data attributes. Kinds: `count` (a round chip; a whole number over 99 reads `99+`, nothing reads `0`), `status` (the tone's dot, then the words), `tag` (words in a pill), `dot` (a bare dot) and `mark` (a round tone holding an icon, drawn by the Icon part's one drawing body at 12). Tones: neutral, action, warning, question, success, danger. A dot or mark with words is an image with that name for screen readers; without words it is hidden. The words are escaped. An unknown kind or tone becomes `tag` or `neutral`. Colours are the shared tokens only; forced colours get an outline.
- **Section heading** (`section-heading.ts`, `section-heading-options.ts`, `section-heading.css`): `sectionHeadingPart(words, { level, end })` returns `div.ui-section-heading` with the words as a real heading (level 2, 3 or 4, default 3) in small uppercase, and an optional end slot after it (`data-slot="end"`) that takes text or any node (a Badge, a button). Long words wrap; the slot keeps its size at the far end. No slot is drawn for a blank end.
- **Keyboard key** (`key.ts`, `key-options.ts`, `key.css`): `keyPart(keys)` returns one `kbd.ui-key` for one key, or a `kbd.ui-key[data-combo]` of nested `kbd` caps for keys pressed together (text splits at `+`, a list is taken as it is); nothing to press gives no element. The cap has no colour of its own: it takes the text colour of where it stands (a menu row's shortcut slot will set it to muted). `escape.ts` is the one place words become markup text.
- **Board:** `src/catalogue/parts.ts` registers Badge, Section heading and Keyboard key as atoms. Badge: rows for each kind (and a count over 99), columns for each tone, controls for Kind, Tone, Words and Mark icon. Section heading: rows for words only, with a count, with a button and long words; controls for Words, Level and End slot. Keyboard key: rows for one, named, two, three and symbol keys; control for Keys. Light and dark show side by side. None of the three has a hover, pressed, focus, disabled or busy look of its own (a badge is read, a heading and a key are labels; the button in a heading's end slot is the Button part), so they show one Normal column, or the tones for Badge. `src/catalogue/board.css` gains a stage width for the heading and a quiet line for a key with nothing to show.
- **Tests:** `tests/badge-heading-key-parts.test.ts` pins the kinds and tones, the one class and the data attributes, the count text, the names for dot and mark, the heading levels and end slot, the key list and caps, escaping, and that the board offers every kind, tone, end slot and key count. A spec in `tests/native-save/native-catalogue-board.spec.ts` drives the three live cells (count over 99, a dot's name, a mark's icon, the heading's level and end slot, one key, a combination and no key).
- **No editor screen changes:** no editor code reaches the new parts; their CSS loads with the parts, on the board only, so the editor's boot did not change. The swaps wait for Lex's Approve.
- **Evidence:** `kit unit --affected` RESULT: ok unit 30/30 (3 files); `npm run check` RESULT: ok tokens in step; `npm run lint` check-exports: 15 unused export(s), 0 failure(s); `kit specs --affected` RESULT: ok specs 1/1 passed; `kit specs tests/native-save/native-catalogue-board.spec.ts` RESULT: ok specs 1/1 passed (20 passed, 1 skipped); `kit size` RESULT: ok size boot 354 KB (±0 KB) vs dev@69e4f6b, budget 355 KB; one-offs RESULT: ok one-offs 1578 hand-typed values in 68 files, none above scripts/agents/one-offs.json. `kit shots` of the three cards at 1280 wide (light and dark) and the Badge card at 390 wide looked at: each card sits whole on the screen; the layout findings listed are the selected title's colour (also on Icon) and neighbouring cards cut off at the screen's edge, none inside the three cards. `kit shots editor pages --compare dev --width 390,1280` RESULT: ok; five of the eight pairs are byte for byte the same, and the three Pages pairs differ in four or five pixels by at most 3 of 255 in one colour channel (the "Page not found" row's dashed icon, base shots cached from an earlier run), nothing visible.
- Feature list: no change (the board is on the preview editor only and no editor screen changed)

### Review fixes (2026-11-11)

- **Key colour (P2, fixed):** `.ui-key` no longer sets `color: var(--muted)`; the cap and its border and fill follow the colour around it. The spec sets a red colour on the live stage and checks that a group's caps and a single cap (colour, and the border mixed from it) compute to it.
- **Long badge (P2, fixed):** the badge has `max-inline-size: 100%` and its words sit in an inner `span` that is cut with an ellipsis (the status dot keeps its size). The Badge card gains a "Long tag" row. The spec narrows the stage to 120px with 80 characters of words and checks the badge is no wider than the stage and the words are cut. Count, status and tag markup now hold the words in that `span`; the unit tests pin it.
- **Mark with no icon (gap, fixed):** the spec calls `badgePart({ kind: "mark" })` and checks it draws an `svg.icon` at `data-size="12"` (the check) and is hidden from assistive technology.
- **Phone width (P3, fixed):** `kit shots` of Section heading and Keyboard key at 390 wide, light and dark: RESULT: ok shots 6 files, 0 failed, 2 layout findings each (the selected title's colour, as on Icon; none inside the card). The long-words row wraps to two lines and the count stays at the far end. Badge at 390 looked at again: RESULT: ok shots 6 files, 0 failed; its findings are the neighbouring cards' small targets at the board's zoomed-out camera, none inside the Badge card.
- **Nits taken:** a status with no words is hidden from assistive technology, like a dot; the `keyList` comment says a `+` key needs the list form; the no-op `text-transform: none` on the heading's end slot is gone.
- **Evidence:** `kit unit --affected` RESULT: ok unit 31/31 (3 files); `npm run check` RESULT: ok tokens in step; `npm run lint` check-exports: 15 unused export(s), 0 failure(s); `kit specs --affected` RESULT: ok specs 1/1 passed; `kit specs tests/native-save/native-catalogue-board.spec.ts` RESULT: ok specs 1/1 passed (21 passed, 1 skipped); `kit size` RESULT: ok size boot 354 KB (±0 KB) vs dev@69e4f6b, budget 355 KB; one-offs RESULT: ok one-offs 1578 hand-typed values in 68 files, none above scripts/agents/one-offs.json.

### Review fixes, round 2 (2026-11-11)

- **Words clipped up and down (S-1, P2, fixed):** the badge's inner `span` now clips only across (`overflow: clip visible`) and has `line-height: normal`, so it is as tall as its words and descenders and accents are never cut; the ellipsis still works. The spec sets a tag's Words to "Égypte jumpy" and checks that the span's `scrollHeight` is no greater than its `clientHeight` and that it does not clip vertically; run against the old rule (`overflow: hidden`, line height 1) it fails, with the fix it passes.
- **Single cap (nit, taken):** the key spec also fills Keys with `K` and checks that cap's colour and its border (mixed from the same colour). The ticket line above now says what is checked.
- **Comments (nit, taken):** the two comments at the top of `key.css` are one.
- Not done: a `kit shots` crop of the badge at 2× zoom (the review's "better still"); the spec above catches the clipping on its own.
- **Evidence:** `kit unit --affected` RESULT: ok unit 31/31 (3 files); `npm run check` RESULT: ok tokens in step; `npm run lint` check-exports: 15 unused export(s), 0 failure(s); `kit specs --affected` RESULT: ok specs 1/1 passed; `kit specs tests/native-save/native-catalogue-board.spec.ts` RESULT: ok specs 1/1 passed (21 passed, 1 skipped); `kit size` RESULT: ok size boot 354 KB (±0 KB) vs dev@69e4f6b, budget 355 KB; one-offs RESULT: ok one-offs 1578 hand-typed values in 68 files, none above scripts/agents/one-offs.json.
