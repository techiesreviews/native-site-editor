# UX rulebook

How the editor should look and feel, seeded from the 35 problems Lex found on the preview after tests
and review had passed ([factory research 01](../wayfinder/software-factory/tickets/01-research-line-today.md),
on branch `research/sf-01-line-today`). Read it when making a mock-up and writing a visible ticket
(kitchen stations 3 and 4), building one, and reviewing one (station 8). A ticket may break a rule only when Lex asked for it there.

Each rule opens with one plain line, then any detail, a **why** naming the correction it comes from,
and a **check**:

- `script: layout`: `kit shots` layout findings (clipped, overlap, tap-target, contrast, overflow).
- `script: colours`: `scripts/check-colours.mjs` (raw colours), in `kit pr`'s css tier.
- `script: spec`: the named browser specs in `tests/native-save/` pin today's cases; a change keeps
  them passing. A new case (a new action, a new insert path) needs its own spec case, and until it
  has one the reviewer checks it by eye.
- `script: text`, `script: frames`, `script: drag`: **planned** in `kit ux`
  ([factory slice 42](../wayfinder/software-factory/build/tickets/42-kit-ux-scripted.md)): new visible
  strings over 60 characters or new hint, tip, count or badge classes; frame strips that show flicker;
  drags to a container's edge. Until it lands the reviewer checks these by eye.
- `eye`: the UX reviewer judges it from screenshots or by trying it.

The Astro User Editor's interaction contract, named as a seed in
[factory slice 40](../wayfinder/software-factory/build/tickets/40-ux-rulebook.md), is no longer on this
machine (searched 2026-10-25); the parts carried over live in the build tickets cited below.

## Say less

- **S1** No explainer lines, hints or keyboard tips beside controls.
  A control shows its name or icon.
  Why: Lex removed the locked-part hint ([components 90](../wayfinder/components-and-builder/build/tickets/90-no-locked-hint.md)),
  the drag label's "Into Div (stack) › after Image" line ([components 91](../wayfinder/components-and-builder/build/tickets/91-drag-label-name-only.md))
  and Media's "Enter opens details · Arrow keys browse" footer ([39925ac8](https://github.com/techiesreviews/native-site-editor/commit/39925ac8));
  the MCP menu is three actions, "no explainer or what soever needed" ([Lex's request 02](../work/lex-requests/issues/02-simple-mcp-menu.md)).
  Check: `script: text`.
- **S2** No counts, badges or dots on tabs, buttons or the page button.
  A count lives inside the menu that acts on it ("Clean up (2)" in More).
  Why: Lex removed the Media tab's number and the page button's blue dot, reversing map ticket 11 and slices 49, 74 and 121
  ([media 122](../wayfinder/media-manager/build/tickets/122-gallery-polish.md) items 1–2).
  Check: `script: text` (count and badge classes).
- **S3** A disabled or empty choice says nothing.
  The screen it opens says why.
  Why: Lex removed the "Nothing to clean up" note under a greyed Clean up ([39925ac8](https://github.com/techiesreviews/native-site-editor/commit/39925ac8)).
  Check: `script: text`.
- **S4** No toasts, info strips or banners after an action.
  The result shows where the action happened (the item, the button, the field); the screen-reader
  status line still announces it. New work adds none; today's toasts go in the atomic catalogue build.
  Why: Lex, 2026-10-23, "the interface should show what is happening" ([factory map](../wayfinder/software-factory/map.md),
  Decisions); the "Filled from …" strip went while the status line kept announcing the fill
  ([components 101](../wayfinder/components-and-builder/build/tickets/101-remove-fill-strip.md)).
  Check: `script: text` + `eye`.
- **S5** Every control in a bar earns its place.
  Leave out modes and toggles Lex did not ask for, rather than squeezing them in.
  Why: Lex removed Edit component mode's Show toggle entirely ([components 89](../wayfinder/components-and-builder/build/tickets/89-edit-mode-bar-fits.md));
  lead PR #109 removed the image bar's shape badge and Decorative toggle.
  Check: `eye`.
- **S6** A short picker is one flat list, without group headings.
  Its items come in a useful order.
  Why: Lex removed the group headings in "Link to a page…" ([components 101](../wayfinder/components-and-builder/build/tickets/101-remove-fill-strip.md)).
  Check: `eye`.
- **S7** Visible words are plain, never code.
  No commit ids, file paths, selectors or technical field names outside the code pane; a component's
  tag is its name and stays.
  Why: the Files header's commit code "meant nothing to Lex" ([media 124](../wayfinder/media-manager/build/tickets/124-files-tab.md));
  "Poster URL" and "span.download-card-meta" in the [media audit](../wayfinder/media-manager/build/ux-ui-audit.md) (C4).
  Check: `eye`.
- **S8** An action with a clear icon shows the icon alone.
  Its name goes in the tooltip and the accessible label, not beside it.
  Why: Lex, 2026-10-25, on the asking-agents mock-up: "remove the text with ask agent, just show the
  icon"; the MCP menu's explainers before it (2026-10-23) ([learning 2026-10-26](../work/learning/2026-10-26.md), item 1).
  Check: `eye`, at mock-up review (kitchen station 3) and UX review.

## Looks

- **L1** A new or redesigned screen starts from a design note and a mock-up Lex approved.
  The note names its references (Mobbin first); the build matches the mock-up side by side.
  Why: "this looks horrible. use mobbin" ([media 123](../wayfinder/media-manager/build/tickets/123-file-details-redesign.md)),
  the Files and Pages tabs ([media 124](../wayfinder/media-manager/build/tickets/124-files-tab.md),
  [125](../wayfinder/media-manager/build/tickets/125-pages-tab.md)); [factory 02](../wayfinder/software-factory/tickets/02-grill-ux-confidence-ladder.md#resolution-2026-10-22) item 2.
  Check: `eye` (the ticket links both).
- **L2** Only theme tokens: no raw colours and no one-off sizes.
  Colours, type sizes, control sizes, radii and states come from `src/theme.css`.
  Why: [editor colours](../editor-colors.md) ("one look across the chrome"); "theme tokens and shared
  components reused (DRY)" ([media 125](../wayfinder/media-manager/build/tickets/125-pages-tab.md)).
  Check: `script: colours`.
- **L3** Every list looks the same.
  32 px rows (`--size-control`), 44 px on touch (`--size-touch`), 2 px apart; grey `--hover`, the
  `--current` tint and 600 weight for what is open, `--pressed` for a pressed toggle; Files and Pages
  share their row and tree rules.
  Why: [editor colours](../editor-colors.md); [media 124](../wayfinder/media-manager/build/tickets/124-files-tab.md), [125](../wayfinder/media-manager/build/tickets/125-pages-tab.md).
  Check: `script: layout` (tap-target) + `eye`.
- **L4** Bars are slim and quiet.
  About 44–48 px, on the panel surface with a hairline edge, text-style actions, one row at every width.
  Why: the selection bar was "too thick" ([media 122](../wayfinder/media-manager/build/tickets/122-gallery-polish.md) item 6).
  Check: `eye`.
- **L5** Space follows the panel's rhythm; a cramped gap is a bug, not taste.
  16 px between a bar and what it controls.
  Why: "add more spacing between the searchbar and the images": the bar's padding had been
  overridden to 0, leaving 4 px ([media 122](../wayfinder/media-manager/build/tickets/122-gallery-polish.md) item 4).
  Check: `eye`.
- **L6** A label and its value read apart.
  A muted label, then the value in the text colour ("Filter All").
  Why: "give the title of a filter a better distinction" ([media 122](../wayfinder/media-manager/build/tickets/122-gallery-polish.md) item 5).
  Check: `eye`.
- **L7** Where the content is a picture, show just the picture.
  Its name, count and select circle come in on hover, keyboard focus and selection; touch keeps the
  circle and count.
  Why: gallery tiles, "show on hover" ([media 122](../wayfinder/media-manager/build/tickets/122-gallery-polish.md) item 3).
  Check: `eye`.
- **L8** A detail view is a calm stage beside a narrow inspector.
  The file whole on the stage (never black bands); the inspector has the name as heading, one facts
  line, short sections with small headings, switches for on/off, chips for tags, and quieter actions in
  one ⋯ with the destructive one last in red.
  Why: the file details redesign and its design note ([media 123](../wayfinder/media-manager/build/tickets/123-file-details-redesign.md)).
  Check: `eye`.
- **L9** Trees read as one tidy list.
  A chevron opens and closes a folder, names at one level line up, icons by kind, a sentence-case
  header with a quiet "+ New"; row actions fade in on hover (desktop) or sit behind one ⋯ (touch).
  Why: the Files and Pages tab redesigns ([media 124](../wayfinder/media-manager/build/tickets/124-files-tab.md), [125](../wayfinder/media-manager/build/tickets/125-pages-tab.md)).
  Check: `eye`.
- **L10** Rare and destructive actions sit in a menu, not the top bar.
  Last, below a separator, in the danger colour, with their confirmation.
  Why: Discard changes moved into the Publish menu ([components 87](../wayfinder/components-and-builder/build/tickets/87-discard-in-publish-menu.md));
  Remove files last in the selection bar ([media 122](../wayfinder/media-manager/build/tickets/122-gallery-polish.md) item 6).
  Check: `eye`.
- **L11** A look Lex approved stays until Lex approves a new mock-up.
  When Lex prefers the old one, restore it rather than trying a third design.
  Why: the Page Structure rings ([a5c4fe72](https://github.com/techiesreviews/native-site-editor/commit/a5c4fe72)),
  restored to the earlier look at Lex's choice ([1f080f39](https://github.com/techiesreviews/native-site-editor/commit/1f080f39)).
  Check: `eye`.
- **L12** Light and dark both look right and read clearly.
  Text above 4.5:1 (3:1 for large text, as WCAG allows) and the focus ring above 3:1, in both schemes.
  The layout check measures text only; the focus ring is judged by eye.
  Why: [editor colours](../editor-colors.md); every redesign Lex judged in the dark theme (media 122–125).
  Check: `script: layout` (contrast) + `eye`.

## Behaviour

- **B1** One click on text types there; a click on anything else selects it.
  The caret lands where it was clicked; a press and drag always moves the block; an image's popup
  opens on a double-click; Esc ends typing and selects the block; anything just added arrives
  selected, not typing.
  Why: Lex, 2026-10-23, "click, and directly select and type" ([Lex's request 01](../work/lex-requests/issues/01-click-to-type.md),
  [clean-up 28](../wayfinder/clean-up-before-features/build/tickets/28-click-to-type.md)),
  which replaced click-selects, double-click-edits ([components 79](../wayfinder/components-and-builder/build/tickets/79-click-selects-double-click-edits.md));
  new blocks arrive selected (79).
  Check: `script: spec` (`native-click-to-type.spec.ts`, `native-text.spec.ts`, `native-blocks.spec.ts`).
- **B2** Delete or Backspace removes the selected element.
  The selection moves to the next sibling, else the previous, else the parent; rows carry no delete icons.
  Why: [components 81](../wayfinder/components-and-builder/build/tickets/81-delete-key-and-no-row-delete.md).
  Check: `script: spec` (`native-delete-key.spec.ts`).
- **B3** Anything moves anywhere valid HTML allows.
  Sections snap between bands. A refusal is the one place for words: it says why, by the pointer, and
  only for invalid HTML, a component's insides or a named slot.
  Why: [components 82](../wayfinder/components-and-builder/build/tickets/82-move-any-element.md);
  refusals keep their reason ([components 91](../wayfinder/components-and-builder/build/tickets/91-drag-label-name-only.md)).
  Check: `script: spec` (`native-move-anywhere.spec.ts`, `native-move-anywhere-actual.spec.ts`; refusals in `native-blocks.spec.ts`).
- **B4** An action works the same everywhere its thing appears.
  The page, Page Structure (row, ⋯ and right-click), Edit component mode and the agent's MCP tool.
  Why: text editing in Page Structure as on slot rows ([components 102](../wayfinder/components-and-builder/build/tickets/102-structure-text-editing.md));
  Make component in every place ([80](../wayfinder/components-and-builder/build/tickets/80-make-component-containers-only.md), [104](../wayfinder/components-and-builder/build/tickets/104-make-component-page-header-footer.md)).
  Check: `script: spec` (`native-structure-text.spec.ts`, `native-make-component-menus.spec.ts`, `native-mcp.spec.ts`).
- **B5** Offer an action only where it makes sense, and hide it elsewhere.
  Make component on containers and the page's own header and footer; no Duplicate, Remove, move or
  Delete on a template's root.
  Why: [components 80](../wayfinder/components-and-builder/build/tickets/80-make-component-containers-only.md),
  [104](../wayfinder/components-and-builder/build/tickets/104-make-component-page-header-footer.md),
  [92](../wayfinder/components-and-builder/build/tickets/92-template-root-actions.md).
  Check: `script: spec` (`native-make-component-menus.spec.ts`, `native-make-component-bands.spec.ts`, `native-edit-component-mode-actual.spec.ts`).
- **B6** Do the work, don't explain it.
  When an action needs something the site lacks (the component loader, the placeholder file), add it
  in the same step instead of showing a note.
  Why: [components 103](../wayfinder/components-and-builder/build/tickets/103-auto-add-component-loader.md), [105](../wayfinder/components-and-builder/build/tickets/105-image-placeholder-first.md).
  Check: `script: spec` (`native-component-loader.spec.ts`, `native-blocks.spec.ts`).
- **B7** Every added image or media starts as the placeholder.
  Replace picks the real file afterwards.
  Why: "always first use placeholders. Even on new projects." ([components 105](../wayfinder/components-and-builder/build/tickets/105-image-placeholder-first.md)).
  Check: `script: spec` (`native-blocks.spec.ts`, `native-media-video.spec.ts`).
- **B8** Fill what can be filled.
  A card linked to a page takes its title, text and image, plain cards as well as components.
  Why: [components 99](../wayfinder/components-and-builder/build/tickets/99-plain-card-fill-and-fixes.md).
  Check: `script: spec` (`native-add-card.spec.ts`, `native-cards.spec.ts`).
- **B9** A rename follows everywhere the name is used.
  Files, CSS and every page's instances.
  Why: renaming a component renames its CSS too ([components 76](../wayfinder/components-and-builder/build/tickets/76-rename-component-in-edit-mode.md)).
  Check: `script: spec` (`native-rename-component-actual.spec.ts`).
- **B10** One user action is one Undo step, and Undo restores all of it.
  Why: asked in each of [components 76](../wayfinder/components-and-builder/build/tickets/76-rename-component-in-edit-mode.md),
  [81](../wayfinder/components-and-builder/build/tickets/81-delete-key-and-no-row-delete.md),
  [103](../wayfinder/components-and-builder/build/tickets/103-auto-add-component-loader.md) and
  [105](../wayfinder/components-and-builder/build/tickets/105-image-placeholder-first.md).
  Check: `script: spec` (the specs named under B2, B6, B7 and B9).
- **B11** Changes apply as they are made; there is no Save or Apply step for a live edit.
  Done or Close only leaves.
  Why: Edit component mode ([components 41](../wayfinder/components-and-builder/build/tickets/41-edit-mode-shell.md));
  the Image popup applies at once and closing writes one Undo step ([clean-up 93](../wayfinder/clean-up-before-features/build/tickets/93-image-popup-flicker.md), lead PR #110).
  Check: `script: spec` (`native-image-popup.spec.ts`; Edit component mode in `native-edit-component-mode-actual.spec.ts`).
- **B12** After adding, the new thing is in view.
  Newest first by default, scrolled to and briefly marked; a filter that would hide it is cleared (no
  "Added to … – Show" line, per S4).
  Why: on Lex's iPhone an uploaded picture "appears to disappear" ([media 103](../wayfinder/media-manager/build/tickets/103-newest-first.md)).
  Check: `script: spec` (`native-media-newest.spec.ts`, at 390 px).
- **B13** Sites follow the visitor's light or dark setting, unless a band sets its own tone.
  Why: [components 75](../wayfinder/components-and-builder/build/tickets/75-starter-follows-visitor-scheme.md).
  Check: `eye`.

## Bugs a user sees

- **U1** Pressing and dragging act on what is under the pointer.
  Pressing inside a selection picks the inner element, any child (an image in a Div) drags by itself,
  and selection boxes follow layout changes at once.
  Why: [components 36](../wayfinder/components-and-builder/build/tickets/36-drag-existing-blocks.md) (fix-lex-2).
  Check: `script: spec` (`native-plain-section-drops-actual.spec.ts`, `native-block-move.spec.ts`), then `script: drag`.
- **U2** A drop near a container's edge lands.
  Within about 8 px it steps up to the nearest parent that takes it; it is refused only for the
  reasons B3 lists.
  Why: [components 33](../wayfinder/components-and-builder/build/tickets/33-drop-target-model.md) (fix-lex-2).
  Check: `script: spec` (`native-plain-section-drops-actual.spec.ts`), then `script: drag`.
- **U3** Zooming, moving and dragging draw smoothly.
  No blank frame, no picture reload, no jump.
  Why: the Image popup flickers while zooming or moving ([clean-up 93](../wayfinder/clean-up-before-features/build/tickets/93-image-popup-flicker.md), found on production).
  Check: `script: frames` + `eye`.
- **U4** Every visible change is tried at 390 px, as a phone user would.
  Its result is looked for; phone sheets and menus never hide each other.
  Why: the iPhone upload ([media 103](../wayfinder/media-manager/build/tickets/103-newest-first.md));
  phone file names and the shape menu under the sheet ([media 86](../wayfinder/media-manager/build/tickets/86-phone-list-view.md), [94](../wayfinder/media-manager/build/tickets/94-phone-shape-menu.md)).
  Check: `script: layout` at 390 + `eye`.
- **U5** Nothing covers what you work on.
  The edit bar never covers the text being edited, a popover never covers another control, and every
  control in a bar stays visible and clickable at every width.
  Why: [components 85](../wayfinder/components-and-builder/build/tickets/85-edit-bar-never-covers-text.md),
  [96](../wayfinder/components-and-builder/build/tickets/96-overlay-overlaps.md),
  [89](../wayfinder/components-and-builder/build/tickets/89-edit-mode-bar-fits.md).
  Check: `script: layout` (overlap, clipped).
- **U6** Touch never sticks.
  Every `:hover` rule sits inside `@media (hover: hover) and (pointer: fine)`, everything pressable
  has an `:active` state, targets are at least 24 px (44 px on touch).
  Why: sticky grey hover on touch in every media screen ([media audit](../wayfinder/media-manager/build/ux-ui-audit.md) C3);
  sizes in [editor colours](../editor-colors.md); the `good-css` skill.
  Check: `script: layout` (tap-target) + `eye`.
- **U7** The keyboard reaches and shows everything.
  Focus shows with `:focus-visible` and `--focus-ring`, never `outline: none`; menus open with Enter,
  Space or ↓, close with Esc and return focus.
  Why: [components 87](../wayfinder/components-and-builder/build/tickets/87-discard-in-publish-menu.md);
  [editor colours](../editor-colors.md); "keyboard reachable: every control focusable, Esc closes"
  ([page builder](../page-builder/README.md#feel)); the `good-css` skill.
  Check: `script: spec` (`native-discard.spec.ts`) + `eye`.
- **U8** Motion respects the reduced-motion setting.
  A transition that moves or scales sits inside `prefers-reduced-motion: no-preference`, names its
  properties and never uses `ease-in`.
  Why: "fast and calm: motion 120–200 ms ease-out, no bounce; respect `prefers-reduced-motion`"
  ([page builder](../page-builder/README.md#feel)); the `good-css` skill, which all editor CSS follows.
  Check: `eye`.

## Not a rule

- The section grip on a template's root in Edit component mode
  ([components 41](../wayfinder/components-and-builder/build/tickets/41-edit-mode-shell.md)): a one-off
  leak; the ⠿ grip itself is gone ([components 36](../wayfinder/components-and-builder/build/tickets/36-drag-existing-blocks.md)),
  and the regression test from `c27d560c` in `native-make-component.spec.ts` keeps it from coming back.

## How rules are added

- A correction from Lex in a build's feedback log ([factory slice 22](../wayfinder/software-factory/build/tickets/22-one-feedback-log.md))
  or from chat learning ([factory slice 52](../wayfinder/software-factory/build/tickets/52-chat-learning.md))
  becomes a rule here only after Lex has seen it.
- A new rule takes the next number in its section and has its why, source link and check. One rule
  may cover several corrections; extend a rule rather than adding a near-copy.
- A `script` rule names the kit check that enforces it once that check is built; until then it says
  which check is planned and the reviewer looks by eye.
- When Lex reverses a rule, change or remove it with the date and Lex's words in the why.
