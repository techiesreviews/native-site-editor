---
title: Editor parts slice 3 - Icon button and Text button parts (TOOLS-248)
status: closed
assignee: fleet-lead
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
- Commits: "Editor parts: Icon button and Text button parts, screens swapped to them (TOOLS-248)", "Editor parts: the editor and the design board load the two parts' styles as the Button's are loaded", "Editor parts: the top bar sizes only its own icon buttons, never those in the project menu", "Editor parts: ticket for slice 3, the Icon button and Text button parts (TOOLS-248)", "Review round 1: the compact Text button fills on press and waits for a mouse to fill on hover; the top bar's sizing has a test", "Editor parts: slice 3 ticket closed with its differences list; the Text button's comment says compact fills on press too", "Second look: the Icon button and the Text button take their looks from their own --icon-btn-* and --text-btn-* defaults; the compact size changes only those", "Editor parts: slice 3 ticket records the second look's decisions", "Editor parts: slice 3 paused; its ticket keeps the second look's Download original finding open", "Second look: Media's Download original and suggested name use a new underlined Text button and give it no look of their own", "Editor parts: slice 3 ticket records the underlined Text button and its Media evidence", "Editor parts: slice 3 ticket records review round 3's decisions", "Editor parts: slice 3 ticket closed", "docs: 03-icon-button-and-text-button commits by subject", "Editor parts: the editor loads the button parts' files through src/ui/parts.css, so src/main.ts stays within its line ceiling", "Editor parts: slice 3 ticket records the loading change, the rebase on the Inbox and their evidence" and this commit.
- Page structure (2026-11-15, PR review): a row's icon actions (Edit, Reset to default, Attributes, Edit component,
  Disconnect this instance, More actions) are Icon buttons sized 22px by `.page-structure__action`; the Show toggle
  and Open › keep their own look (a toggle with its own on and off colours, and words) until a part takes them.
  A disabled Text button no longer underlines or fills on hover or press, as a disabled Icon button.
- Underlined variant (2026-11-15): `textButton(words, action, { underlined: true })` adds `text-button--underlined`,
  which sets only `--text-btn-decoration` (none at rest by default). Media's Download original
  (`media-detail__original`) and the suggested free name (`media-detail__suggest`) use it; their screen rules keep only
  placement and the tap area. Links that carry the `text-button` class (`repository-menu__action`) already set no
  underline themselves, so the new resting default changes nothing there.
- Loading (2026-11-15): `kit pr`'s full run found `src/main.ts` at 542 lines over its ceiling of 540 (dev was at
  540 and the two parts added an import each). Rather than raise the ceiling, `src/ui/parts.css` imports the Button,
  Icon button and Text button files in that order and `src/main.ts` imports only it, in the Button's old place: the
  built CSS holds each part once, in the same order. The design board still loads each file on its own.
- Rebased on dev after the Inbox (TOOLS-222) landed: its top-bar Inbox button already wears the Icon button part's
  class (its own CSS only places it and draws its dot) and its other buttons are the Button part, so nothing to swap.
- Tests: `tests/icon-button-text-button-parts.test.ts` (options, markup, CSS layer and loading, copy homes, parts list,
  the top bar's sizing, the underlined variant, Media's two buttons without a look of their own); `kit unit --affected`
  3150/3151 on 2026-11-15, the one failure `tests/preview-menu.test.ts` (copy icon timing) passing 11/11 alone.
- Evidence: `kit shots --compare dev` for editor, structure, media-gallery, file-details and improve-images at 390 and
  1280, light and dark: pixel-identical but structure 390 light, where the cached dev shot caught the page tree before
  the header and footer carets drew (dark, and the retake, match). Steps tries: project menu with Branches at 1280 and
  the phone menu's Add a block view at 390, light and dark. `kit size`: boot 354 KB (±0), budget 355 KB.
  After the underlined variant (2026-11-15): `kit shots file-details media-gallery --compare dev` at 390 and 1280,
  light and dark, pixel-identical; a raw scenario that keeps an original and opens Copies and original shows the
  Download original row pixel-identical to dev in all four, with the same computed border, background, colour, size,
  alignment and underline. Copies: 123 (unchanged). After the rebase and the loading change:
  `kit shots editor structure file-details media-gallery --compare dev` (dev with the Inbox) at 390 and 1280, light
  and dark: 15 of 16 pixel-identical; file-details 1280 dark differs in a 3 by 3 px corner edge by one shade
  (anti-aliasing, light identical). `kit unit --affected` 3152/3152. `kit size`: boot 355 KB (+1 KB), budget 355 KB.
  Page structure's icon actions (PR review fix): a raw scenario hovering a component row in the starter at 1280,
  light and dark, against dev: at rest pixel-identical; with Disconnect this instance hovered only that 22px button's
  corner differs (4px to 6px), with the same size, fill and colour. `kit specs` for the structure compact, card paths
  and published slot specs 46/46; `kit unit --affected` 3154/3154; copies 123.
- Review decisions (PR review, 2026-11-15): fixed the Page structure icon actions (P2), the Commits list (P3) and
  the disabled Text button's hover and press (P3), and the share row's stale comment. Media test reworked to accept
  any key order. Declined again the DOM test of `iconButton()` (reason above). Left for later slices, as the review
  suggests: the Inbox button's hand-written markup (the markup options take no `id` or `popovertarget` yet); Media's
  round 44px Back, Close and Dismiss buttons (a round Icon button variant); snapping the Text button's 5px padding to
  the scale; keeping a pressed Icon button's fill on hover; `src/ui/parts.css` beside the `src/ui/parts/` folder
  until slice 1 moves the parts into folders.
- Differences, the most used look winning (Lex's rule of 2026-11-14), none of them in a screenshot but the first:
  - Project menu, Reload repositories: its icon sat 2px right of centre (the browser's own button padding); now centred.
  - Branches flyout's Refresh from GitHub and Reload repositories: keyboard focus shows the focus ring only, without
    the hover fill, as every other icon button.
  - Component panel's icon buttons: the hover fill waits for a mouse and a touch press fills, as every other icon button.
  - Component panel's Choose image… (compact Text button): fills on press; the hover fill waits for a mouse.
  - Page structure's row actions: their corner goes from 4px to the Icon button's 6px; the hover fill waits for a
    mouse and a touch press fills; keyboard focus shows the focus ring with the icon muted, as every other icon button.
  - Disabled Text buttons (an agent pin's Undone, Undo while undoing): no underline on hover, as disabled Icon buttons.
  - Rows in the project menu and the agent menu that borrow the `text-button` class no longer underline on hover, as
    the editor's other menu rows (the share rows already removed it).
- Review decisions: fixed (2026-11-15) the second look's P2 on `media-detail.css:121` (the Download original
  button's border, background, colour and underline set by the screen). An earlier decline said
  `.media-library button` needed them cancelled; that was wrong (it sets only the font, corner, minimum height and
  cursor), so the look declarations and the font size went, the underline became the Text button's underlined
  variant (`media-detail__original`, `media-detail__suggest`), and the placement and tap-area rules stayed.
  Declined its browser tests for the compact hover and touch states and for a
  long file name at 320px: the unit test pins the CSS, and the file name's layout is unchanged by this slice.
  Declined a DOM test of `iconButton()` and `textButton()` (review round 3 pointed at the fake `document` in
  `tests/select-options.test.ts`): both are one-line wrappers over `button()` and the pure options, which the unit
  tests pin, and the browser specs already find these buttons by role and class and press them
  (`tests/native-save/native-media-adding.spec.ts`), so a fake DOM would test the fake.
  Left as is (review round 3 nit): a compact underlined Text button would drop its underline on hover; no screen asks
  for that pair, and the next part that needs it can set the hover hook then.
- Feature list: no change (the parts swap keeps every feature as it was)
