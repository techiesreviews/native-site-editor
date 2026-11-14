---
title: Editor parts slice 3 - Icon button and Text button parts (TOOLS-248)
status: closed
assignee: fleet-lead (claude-opus-5-5)
blocked_by: []
---

## What

Slice 3 of [the parts plan](../../../agents/parts-plan.md) (Orbit card TOOLS-248, parent TOOLS-238): two parts, the
Icon button and the Text button, made from `.icon-button` and `.text-button` in `src/style.css`, each in its own
folder under `src/ui/` with its code, its pure options, its CSS on the Techies Framework layers (like the Button pilot,
`src/ui/parts/button.css`) and its entry in `docs/agents/parts.json`. Screens swap to the new parts.

Lex's rule: when copies differ slightly, the most used look wins without asking him; anything that would visibly change
beyond that stays as a named variant. Nothing else visible changes.

## Done when

- Both parts exist in `src/ui/icon-button/` and `src/ui/text-button/`, are tested, and are in the generated parts list.
- Screens that made these buttons by hand or styled their own copies use the parts; the copy count goes down.
- `kit shots --compare dev` (light and dark, 390 and 1280) shows the touched screens unchanged, or each difference listed.
- The import guard stays green and the boot stays within 355 KB.

## Done (2026-11-14)

- Behaviour: two parts, `iconButton()` in `src/ui/icon-button/` and `textButton()` in `src/ui/text-button/`, each with
  pure options, its look on the components layer and its entry in `docs/agents/parts.json`. Swapped to them: the code
  editor's Undo, Redo and History; the phone top bar's Menu and Back; the project menu's Reload repositories and the
  branches flyout's Refresh from GitHub; the component panel's icon buttons and Choose image…; and every text button
  made with `button(…, "text-button …")` (source editor, agent pins, page structure, structure card, media screens,
  the repository list's Cancel). The menus' rows that borrow the `text-button` class keep their own look until the
  Menu item part (slice 6).
- Copies: 132 before, 123 after (buttons made by hand 58 to 55, button looks 32 to 26).
- Commits: Editor parts: Icon button and Text button parts, screens swapped to them (TOOLS-248); Editor parts: the
  editor and the design board load the two parts' styles as the Button's are loaded; Editor parts: the top bar sizes
  only its own icon buttons, never those in the project menu; Editor parts: ticket for slice 3, the Icon button and
  Text button parts (TOOLS-248); Review round 1: the compact Text button fills on press and waits for a mouse to fill
  on hover; the top bar's sizing has a test; Editor parts: slice 3 ticket closed with its differences list; Second look:
  the Icon button and the Text button take their looks from their own --icon-btn-* and --text-btn-* defaults.
- Tests: `tests/icon-button-text-button-parts.test.ts` (options, markup, CSS layer and loading, copy homes, parts list,
  the top bar's sizing); `kit unit --affected` 3147/3147.
- Evidence: `kit shots --compare dev` for editor, structure, media-gallery, file-details and improve-images at 390 and
  1280, light and dark: pixel-identical but structure 390 light, where the cached dev shot caught the page tree before
  the header and footer carets drew (dark, and the retake, match). Steps tries: project menu with Branches at 1280 and
  the phone menu's Add a block view at 390, light and dark. `kit size`: boot 354 KB (±0), budget 355 KB.
- Differences, the most used look winning (Lex's rule of 2026-11-14), none of them in a screenshot but the first:
  - Project menu, Reload repositories: its icon sat 2px right of centre (the browser's own button padding); now centred.
  - Branches flyout's Refresh from GitHub and Reload repositories: keyboard focus shows the focus ring only, without
    the hover fill, as every other icon button.
  - Component panel's icon buttons: the hover fill waits for a mouse and a touch press fills, as every other icon button.
  - Component panel's Choose image… (compact Text button): fills on press; the hover fill waits for a mouse.
  - Rows in the project menu and the agent menu that borrow the `text-button` class no longer underline on hover, as
    the editor's other menu rows (the share rows already removed it).
- Review decisions: the second look's P2 on `media-detail.css:121` (the Download original button's border, background,
  colour and underline) is declined: those declarations were there before this slice, which only swapped the call to
  `textButton()`, and the border, background and colour are needed to cancel `.media-library button`
  (`src/page-builder/media-picker.css:12`, unlayered), which gives every Media button a look and beats any part on
  the components layer. Media's blanket button rule is the screen styles split's work (slice 7); an underlined
  variant can join the Text button then. Declined its browser tests for the compact hover and touch states and for a
  long file name at 320px: the unit test pins the CSS, and the file name's layout is unchanged by this slice.
  Declined a DOM test of `iconButton()` and `textButton()`: the unit tests run without a DOM, and the
  browser specs already find these buttons by role and class (`tests/native-save/native-media-adding.spec.ts`).
- Feature list: no change (the parts swap keeps every feature as it was)
