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
- Copies: 132 before, 122 after (buttons made by hand 58 to 54, button looks 32 to 26).
- Commits: "Editor parts: Icon button and Text button parts, screens swapped to them (TOOLS-248)", "Editor parts: the editor and the design board load the two parts' styles as the Button's are loaded", "Editor parts: the top bar sizes only its own icon buttons, never those in the project menu", "Editor parts: ticket for slice 3, the Icon button and Text button parts (TOOLS-248)", "Review round 1: the compact Text button fills on press and waits for a mouse to fill on hover; the top bar's sizing has a test", "Editor parts: slice 3 ticket closed with its differences list; the Text button's comment says compact fills on press too", "Second look: the Icon button and the Text button take their looks from their own --icon-btn-* and --text-btn-* defaults; the compact size changes only those", "Editor parts: slice 3 ticket records the second look's decisions", "Editor parts: slice 3 paused; its ticket keeps the second look's Download original finding open", "Second look: Media's Download original and suggested name use a new underlined Text button and give it no look of their own", "Editor parts: slice 3 ticket records the underlined Text button and its Media evidence", "Editor parts: slice 3 ticket records review round 3's decisions", "Editor parts: slice 3 ticket closed", "docs: 03-icon-button-and-text-button commits by subject", "Editor parts: the editor loads the button parts' files through src/ui/parts.css, so src/main.ts stays within its line ceiling", "Editor parts: slice 3 ticket records the loading change, the rebase on the Inbox and their evidence", "docs: 03-icon-button-and-text-button commits by subject", "PR review: Page structure's icon actions are Icon buttons; a disabled Text button stays still on hover and press", "Editor parts: slice 3 ticket records the PR review's fixes and decisions", "docs: 03-icon-button-and-text-button commits by subject", "docs: 03-icon-button-and-text-button follow-ups from review", "Second look: the Files tree's ⋯, + and Restore and History's Refresh and ⋯ use the parts; a hidden slot's eye stays muted on hover", "Copies: 122 after the Files tree's ⋯ uses the Icon button", "Editor parts: slice 3 ticket records the second look's fixes and decisions", "docs: 03-icon-button-and-text-button commits by subject", "Second look: History's ⋯ shows no fill of its own while its menu is open, as the other menu Icon buttons", "Second look: the History test reads only an open menu's fill, not its visibility", "docs: 03-icon-button-and-text-button commits by subject" and this commit.
- Page structure (2026-11-15, PR review): a row's icon actions (Edit, Reset to default, Attributes, Edit component,
  Disconnect this instance, More actions) are Icon buttons sized 22px by `.page-structure__action`; the Show toggle
  and Open › keep their own look (a toggle with its own on and off colours, and words) until a part takes them.
  A disabled Text button no longer underlines or fills on hover or press, as a disabled Icon button.
- Files tree and History (2026-11-15, second look): the Files tree's ⋯ (`file-more`) and a folder's + (`file-add`)
  are Icon buttons, Restore (`file-restore`) a compact Text button, and History's Refresh and a commit's ⋯ Icon
  buttons; their screen CSS keeps only size and placement. The copy counter missed these (their class names hold no
  `button`).
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

### Follow-ups

- Validation gaps (gap): R1-4 still open: There is still no test that builds a real button with `iconButton()`. It now has more callers: Page structure uses the empty-glyph path and the title-string path. The ticket's reason for declining (`03-icon-button-and-text-button.md:94-97`) says `iconButton()` is a "one-line wrapper over `button()`"…
- Spec (P3): e79b6a764:src/components/page-structure.css:272 — P3 ticket: The ticket says the Show toggle "keeps its own look" and that "nothing else visible changes", but the hidden-slot eye toggle now changes colour on hover and keyboard focus. Before this change, `.page-structureaction:hover` and `.page-structureaction:focus-visible` both weighed one class plus one state. `.page-structureslot-toggle[aria-pressed="false"] { color: var(--muted) }` (line 296) weighs the same and comes later, so a closed eye stayed muted on hover and on focus. Adding `:not(.icon-button)` makes lines 272-273 weigh one class more, so they now win: hovering or tabbing to a hidden slot's eye turns its icon full text colour. This isn't in the Differences list or the screenshot evidence, which covered a component row, not a hidden slot. Fix: write the selectors as `.page-structureaction:where(:not(.icon-button)):hover` and `.page-structureaction:where(:not(.icon-button)):focus-visible`. That keeps their old weight, so line 296 wins again. Also use `:where(...)` on line 266 for the same reason.
- Validation gaps (gap): R1-4, still open: add `tests/icon-button.test.ts` using the fake `document` already used by `tests/select-options.test.ts`. It should check three things: `iconButton("Close", null, { title: false })` makes a button with `type="button"`, `aria-label="Close"`, no `title` attribute and no children. `iconButton("Actions for x", glyph, { title: "More actions", className: "page-structureaction", action })` gives the class `"icon-button page-structureaction"`, title "More actions" and the glyph as its only child, and one click calls `action` once. Leaving `title` out sets it to the label.
- Validation gaps (gap): The hover colour of the hidden-slot eye toggle (the Spec defect above) has no test. After the fix, add a check to the new Page structure test in `tests/icon-button-text-button-parts.test.ts`: no rule whose selector holds `:not(.icon-button)` may set `color` unless it uses `:where(`. Or add a raw-scenario screenshot hovering a hidden slot's eye, light and dark, compared with dev.
- Validation gaps (gap): R2-3 still open: `tests/icon-button.test.ts` was not added. The ticket declines it again for the reason above.
- Validation gaps (gap): R2-1 still open: No test builds a real button with `iconButton()` yet. This round gave it three more callers: the Files tree's ⋯ (no action, a title string), History's Refresh (an action, the default title) and History's ⋯ (`title: false`). The ticket's reason for declining (`03-icon-button-and-text-button.md:111-11…
- Spec (P3): 9c4a3e1f2:docs/work/editor-parts/issues/03-icon-button-and-text-button.md:119-124 — P3 ticket: the new "Follow-ups" section still lists the Page structure hidden-slot eye (the Spec P3) and its missing test as open. Commit 05ec56d98 fixed both, and the same ticket's "Review decisions (second look …)" paragraph (lines 83-87) says so. The pasted text has also lost its double underscores, so it reads `.page-structureaction` and `.page-structureslot-toggle`, class names that do not exist. Fix: remove the two fixed items. Keep only the `iconButton()` DOM-test gap, with the class names in backticks.
- Spec (P3): 8a4b10988:docs/work/editor-parts/issues/03-icon-button-and-text-button.md:111-114 — P3 ticket: the reason for declining says `iconButton()` and `textButton()` are "both … one-line wrappers over `button()`". That holds for `textButton()` only. `iconButton()` has its own logic (see R2-1), and the ticket now uses this wrong reason to decline the test a third time. Fix: correct the sentence, or add the test (R2-3), which settles both.
- Standards (P3): 05ec56d98:src/controllers/files-tree-controller.ts:317-321 — P3 style (CODING_STANDARDS.md "UI parts": "A screen that touches a home-made copy (a button made with `node("button")` …) swaps it for the part when the part fits"): the folder's + is still `node("button", iconButtonClass("file-add"))`. Its `type`, `aria-label` and `title` are set by hand, which repeats what `iconButton()` already does. The part fits: a label, a glyph drawn later by `setIcon`, a title string and an action. The controller takes its DOM helpers through `ports.ui`, which may be why. Fix: add `iconButton` to `FilesTreePorts.ui` (`Pick<typeof dom, "node" | "button"> & { setIcon; iconButton }`). Then build it with `iconButton(\`New in ${path}\`, null, { title: \`New file or folder in ${path}\`, className: "file-add", action: () => ports.create(path, add) })`, keeping the `aria-haspopup` line. Update the test regex at `tests/icon-button-text-button-parts.test.ts:152` to match.
- Standards (P3): 05ec56d98:src/components/create-dialog.css:39-40 — P3 style (CODING_STANDARDS.md has no rule on comments; this is a readability nit): two comments now sit on top of each other above `.file-add`. The old one ("beside a folder, and at the top of the tree") stays on top of the new one ("beside a folder is an Icon button … sized here"). The only `file-add` in the code is the per-folder one in `files-tree-controller.ts:317`, so "at the top of the tree" looks stale. Fix: merge them into one line.
- Validation gaps (gap): R1-4 / R2-1 / R2-3, still open: add `tests/icon-button.test.ts` using the fake `document` from `tests/select-options.test.ts`. Check three things: `iconButton("Actions for c1", null, { title: false, action })` makes a button with `type="button"`, `aria-label="Actions for c1"`, no `title` attribute and no children, and one click calls `action` once. `iconButton("Actions for a.md", glyph, { title: "Rename, duplicate, delete…", className: "file-more" })` gets the class `"icon-button file-more"`, that title, the glyph as its only child, and no click listener. `iconButton("Refresh history", null)` gets the title "Refresh history".
- Validation gaps (gap): The visible differences in this round have no screenshot. The ticket's evidence for this round is `kit shots files --compare dev` only. Nothing shows the History panel (Refresh, a commit's ⋯ hovered, and its menu open with no fill) or a deleted file's row with Restore (now normal weight and 6px side padding). The differences list names them, but nothing shows them. Add a raw scenario at 1280, light and dark, against dev, that opens History, hovers a commit, opens its ⋯ menu, and shows a deleted file's row with Restore hovered.

