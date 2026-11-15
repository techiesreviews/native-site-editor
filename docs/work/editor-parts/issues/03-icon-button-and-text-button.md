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
- Copies: 132 before, 119 after (buttons made by hand 58 to 51, button looks 32 to 26).
- Commits: "Editor parts: Icon button and Text button parts, screens swapped to them (TOOLS-248)", "Editor parts: the editor and the design board load the two parts' styles as the Button's are loaded", "Editor parts: the top bar sizes only its own icon buttons, never those in the project menu", "Editor parts: ticket for slice 3, the Icon button and Text button parts (TOOLS-248)", "Review round 1: the compact Text button fills on press and waits for a mouse to fill on hover; the top bar's sizing has a test", "Editor parts: slice 3 ticket closed with its differences list; the Text button's comment says compact fills on press too", "Second look: the Icon button and the Text button take their looks from their own --icon-btn-* and --text-btn-* defaults; the compact size changes only those", "Editor parts: slice 3 ticket records the second look's decisions", "Editor parts: slice 3 paused; its ticket keeps the second look's Download original finding open", "Second look: Media's Download original and suggested name use a new underlined Text button and give it no look of their own", "Editor parts: slice 3 ticket records the underlined Text button and its Media evidence", "Editor parts: slice 3 ticket records review round 3's decisions", "Editor parts: slice 3 ticket closed", "docs: 03-icon-button-and-text-button commits by subject", "Editor parts: the editor loads the button parts' files through src/ui/parts.css, so src/main.ts stays within its line ceiling", "Editor parts: slice 3 ticket records the loading change, the rebase on the Inbox and their evidence", "docs: 03-icon-button-and-text-button commits by subject", "PR review: Page structure's icon actions are Icon buttons; a disabled Text button stays still on hover and press", "Editor parts: slice 3 ticket records the PR review's fixes and decisions", "docs: 03-icon-button-and-text-button commits by subject", "docs: 03-icon-button-and-text-button follow-ups from review", "Second look: the Files tree's ⋯, + and Restore and History's Refresh and ⋯ use the parts; a hidden slot's eye stays muted on hover", "Copies: 122 after the Files tree's ⋯ uses the Icon button", "Editor parts: slice 3 ticket records the second look's fixes and decisions", "docs: 03-icon-button-and-text-button commits by subject", "Second look: History's ⋯ shows no fill of its own while its menu is open, as the other menu Icon buttons", "Second look: the History test reads only an open menu's fill, not its visibility", "docs: 03-icon-button-and-text-button commits by subject", "docs: 03-icon-button-and-text-button follow-ups from review", "Second look: the Files tree's folder + is the Icon button's own element; the two parts' elements have a test", "docs: 03-icon-button-and-text-button commits by subject", "docs: 03-icon-button-and-text-button follow-ups from review", "Second look: the top bar sizes only its own icon buttons, not History's; the Pages tree's + and ⋯ are Icon buttons; a compact underlined Text button keeps its underline on hover", "Editor parts: the two parts fit the boot budget: hook defaults read as fallbacks, keyword underlines, slimmer class builders; History sizes its own icon buttons", "Editor parts: slice 3 ticket records the boot budget trims, the third second look and their evidence", "docs: 03-icon-button-and-text-button commits by subject", "Editor parts: slice 3 review after the rebase: the ticket's underlined variant line and High Contrast difference, the Text button's link comment, the parts plan's fallback hooks", "Editor parts: slice 3 ticket records the GPT second look on the fixes and its declined phone size", "Editor parts: slice 3 ticket lists History's touch size and the shots not taken as follow-ups" and this commit.
- Page structure (2026-11-15, PR review): a row's icon actions (Edit, Reset to default, Attributes, Edit component,
  Disconnect this instance, More actions) are Icon buttons sized 22px by `.page-structure__action`; the Show toggle
  and Open › keep their own look (a toggle with its own on and off colours, and words) until a part takes them.
  A disabled Text button no longer underlines or fills on hover or press, as a disabled Icon button.
- Files tree and History (2026-11-15, second look): the Files tree's ⋯ (`file-more`) and a folder's + (`file-add`)
  are Icon buttons, Restore (`file-restore`) a compact Text button, and History's Refresh and a commit's ⋯ Icon
  buttons; their screen CSS keeps only size and placement. The copy counter missed these (their class names hold no
  `button`). The Files tree controller gets `iconButton` through its `ui` ports, as it gets `node` and
  `button`, so the + is the part's own element.
- Underlined variant (2026-11-15): `textButton(words, action, { underlined: true })` adds `text-button--underlined`,
  which sets its own `text-decoration: underline` (the base Text button has no underline at rest). Media's Download original
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
  Files tree and History swap: `kit specs` files tab, history, history action and structure compact 72/72;
  `kit unit --affected` 3156/3156; `kit shots files --compare dev` at 390 and 1280, light and dark: 390 identical,
  1280 differs only by one shade in a corner speck of the top bar (the same anti-aliasing as file-details); copies 122.
- Review decisions (PR review, 2026-11-15): fixed the Page structure icon actions (P2), the Commits list (P3) and
  the disabled Text button's hover and press (P3), and the share row's stale comment. Media test reworked to accept
  any key order. Declined again the DOM test of `iconButton()` (reason above). Left for later slices, as the review
  suggests: the Inbox button's hand-written markup (the markup options take no `id` or `popovertarget` yet); Media's
  round 44px Back, Close and Dismiss buttons (a round Icon button variant); snapping the Text button's 5px padding to
  the scale; keeping a pressed Icon button's fill on hover; `src/ui/parts.css` beside the `src/ui/parts/` folder
  until slice 1 moves the parts into folders.
- Review decisions (second look, opencode/deepseek-v4.1-flash-free, 2026-11-15): fixed the hidden slot eye's hover
  colour (P3: the Page structure guard is `:where(:not(.icon-button))`, adding no weight, so the muted rule wins again)
  and the three hand-made copies in the Files tree and History (P2). Declined again its DOM test of the two parts
  (reason above) and its counter change for class names without `button` (a copy-counter change for its own slice;
  the swapped files are pinned in `tests/icon-button-text-button-parts.test.ts`).
- Review decisions (second look again, 2026-11-15): fixed the folder + still made by hand (P2/P3), the stale
  follow-ups and the wrong decline reason (P3), the stacked comment above `.file-add`, and added the DOM test.
  `kit unit --affected` 3160/3160; copies 121.
- Differences, the most used look winning (Lex's rule of 2026-11-14), none of them in a screenshot but the first:
  - Project menu, Reload repositories: its icon sat 2px right of centre (the browser's own button padding); now centred.
  - Branches flyout's Refresh from GitHub and Reload repositories: keyboard focus shows the focus ring only, without
    the hover fill, as every other icon button.
  - Component panel's icon buttons: the hover fill waits for a mouse and a touch press fills, as every other icon button.
  - Component panel's Choose image… (compact Text button): fills on press; the hover fill waits for a mouse.
  - Page structure's row actions: their corner goes from 4px to the Icon button's 6px; the hover fill waits for a
    mouse and a touch press fills; keyboard focus shows the focus ring with the icon muted, as every other icon button.
  - Disabled Text buttons (an agent pin's Undone, Undo while undoing): no underline on hover, as disabled Icon buttons.
  - Files tree's ⋯ and +, History's Refresh and ⋯: the hover fill waits for a mouse and a touch press fills.
  - History's ⋯: no fill while its menu is open, as the Files tree's and Page structure's ⋯ (two of the three menu
    Icon buttons; setting the part's hooks from the screen would add hand-set custom properties).
  - Files tree's Restore (a deleted file's row): normal weight instead of bold, 6px side padding instead of 8px, the
    hover fill waits for a mouse, as the compact Text button (Choose image…).
  - Rows in the project menu and the agent menu that borrow the `text-button` class no longer underline on hover, as
    the editor's other menu rows (the share rows already removed it).
  - Compact Text buttons (Choose image…, Restore) in Windows High Contrast: the hover and press underline is drawn
    see-through to save boot bytes, and forced colours may show it, where dev showed none.
- Review decisions: fixed (2026-11-15) the second look's P2 on `media-detail.css:121` (the Download original
  button's border, background, colour and underline set by the screen). An earlier decline said
  `.media-library button` needed them cancelled; that was wrong (it sets only the font, corner, minimum height and
  cursor), so the look declarations and the font size went, the underline became the Text button's underlined
  variant (`media-detail__original`, `media-detail__suggest`), and the placement and tap-area rules stayed.
  Declined its browser tests for the compact hover and touch states and for a
  long file name at 320px: the unit test pins the CSS, and the file name's layout is unchanged by this slice.
  The DOM test of `iconButton()` and `textButton()` asked for since review round 3 is `tests/icon-button.test.ts`
  (2026-11-15), on the fake `document` of `tests/select-options.test.ts`: the label, the tooltip (its own, the
  label's, or none), the glyph, the action and a failing action reaching the error reporter, and the Text button's
  classes, words and click. Earlier declines called both parts one-line wrappers; that held only for `textButton()`.
- Feature list: no change (the parts swap keeps every feature as it was)

- Boot budget (2026-11-15): after dev took the Inbox, dev boots in 363,274 of the 363,520 bytes the budget allows,
  and this branch measured 363,681 (161 over; CI's Byte budget failed too). The two parts' code and styles load at
  start, as Page structure draws with them. Trimmed without a visible change: each part's hook defaults are now read
  as fallbacks where they are used (`var(--text-btn-radius, 0)`) instead of declared on the class; the Text button
  underlines with plain keywords (the build added a `-webkit-` copy of every `var()` underline) and the compact size
  hides its hover underline with a see-through colour; the class builders lost a duplicate runtime size check and
  whitespace clean-up; `iconButton()` makes its element with `node()`; the top bar keeps its short
  `.topbar-actions .icon-button` rule and History's panel sizes its own buttons over it in its lazily loaded
  stylesheet. Now 363,518 bytes, 2 under the budget (exact cold median, three runs each, on this branch and on dev);
  `kit size`: boot 355 KB (±0 KB) vs dev, ok. The next slice that adds boot bytes must take some out.
- Second look (opencode/deepseek-v4.1-flash-free, 2026-11-15, third look): fixed the top bar's size reaching
  History's buttons (P2: 28px instead of 24px), the Pages tree's + and ⋯ made by hand (P2; now Icon buttons, no
  visible change, copies 119), the missing size evidence (P2, above), the compact underlined Text button losing its
  underline on hover (P3) and the stale follow-ups (P3). Declined the typed ports fixture in
  `tests/files-tree-controller.test.ts` (P3): its `as unknown as FilesTreePorts` cast predates this slice and covers
  the fake DOM the ports return; this slice only added the `iconButton` entry, which `npm run check` types through the
  controller.
- Review after the rebase on dev (claude-opus-5-5, 2026-11-15, the code since the third second look): fixed its four
  P3s in words only (no boot bytes): the underlined variant's line above, the stale "Left as is" note, the Text
  button's comment on links, the High Contrast difference in the list, and a line in `docs/agents/parts-plan.md` on
  the fallback form. Left its shot gaps (the Pages tab's + and ⋯, a deleted file's Restore, Download original after
  the trims) to follow-ups: the specs and the CSS unit test cover them, and `kit ux` tried Pages, Files and Media.
- Second look on the fixes (gpt-6.1-sol, 2026-11-15): declined its P2 that History's
  Refresh and ⋯ shrink from 44px to 24px on phones. On dev they are `commit-history__refresh` and
  `commit-history__more`, not `.icon-button`, so the top bar's 44px phone rule never reached them: they are 24px at
  every width on dev and stay so here. Giving them the touch size is a follow-up for the slice that takes up touch
  sizes, as this one keeps their size. Its shot gaps are the ones left above.
- Review of the ticket note (claude-opus-5-5, 2026-11-15, after the rebase on dev with the UX step fix): fixed its
  P3 by listing History's touch size and the shots not taken under Follow-ups. The rebase changed no code of this
  slice (same patch); `kit ux` on the rebased branch: 0 broken, 4 looks off that plain dev shows too (22px row
  buttons, 16px slot tags and the 23px Add in Page structure at 390; the Branches flyout over the repository list).
- Evidence after the trims: `kit shots editor structure file-details media-gallery files --compare dev` at 390 and
  1280, light and dark: 18 of 20 pixel-identical, files 1280 dark one shade in the top bar's corner speck, structure
  390 light the known caret timing (its retake identical). History opened in the starter at 390 and 1280: its panel
  pixel-identical to dev, Refresh and ⋯ 24 by 24px on both. Download original row: three of four sizes
  pixel-identical to dev with the same computed style (the fourth, 1280 light, timed out in the scenario's upload
  step twice; it matched before the trims). `kit specs` files tab, history, pages look and structure compact 69/69;
  `kit unit --affected` 3163/3163.

### Follow-ups

- Left for later slices (review nits): the Inbox button's hand-written markup (the markup options take no `id` or
  `popovertarget` yet); Media's round 44px Back, Close and Dismiss buttons (a round Icon button variant); snapping
  the Text button's 5px padding to the scale; keeping a pressed Icon button's fill on hover; the phone top bar's Menu
  sets `title: false` and then its title by hand; a copy counter that also sees button looks whose class names hold no
  `button`; the boot budget has 2 bytes left.
- Left for the slice that takes up touch sizes: History's Refresh and ⋯ get the 44px touch size on phones
  (`src/components/commit-history.css:43` holds them at `--size-icon`, 24px at every width, as on dev).
- Not shot after the trims: the Pages tab's + and ⋯, and Download original at 1280 light.
- Not shot: a deleted file's Restore (normal weight, 6px side padding, as the compact Text button); its difference is
  listed above and pinned in `tests/icon-button-text-button-parts.test.ts`.
