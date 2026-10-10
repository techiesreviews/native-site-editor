# Cards: grids of repeated items and their pages

A static grid of cards can link to subpages. Adding to it writes one card into
the page's HTML and, when asked, one new page file beside its siblings. Both are
drafts like any other edit, readable in the code pane as they happen. Cards are
ordinary editable markup.

## What the user can do

**On the canvas**

- Hover any item of a grid or list (a card, a list item, a link in a row): a
  dashed ghost shows where one more item would go, after the last one
  (beside it when there is room in the row, else at the start of the next row,
  or below it in a list), with **+ Add card** (Add item, Add link…) in it.
  The ghost also shows while an item, or anything in one, is selected.
  A ghost below its grid that runs past the bottom of the view while the
  item is in view is cut at that edge (a line with its button when little
  is left), so Add card stays reachable.
- Add card places a card immediately, selected, as one undo step: a card
  slot's fresh component with template fallbacks, or a plain grid's last
  item copied with its text reset.
- A component item with a template, an item in a collection grid, or a plain
  item whose title is a heading then opens **Link to a page…**. All site pages except the current page and 404
  are listed as one plain list without group headings, the cards' folder first
  and the rest after it, in site order within each. Siblings' pages say **In this grid**
  and cannot be picked. Esc leaves the new card blank.
- Type an unknown title or address to get **+ Create page /work/oak-ash/**.
  Titles go under the folder inferred from sibling links, then the collection
  folder, then `/`. Addresses keep their lowercased slug. One new folder
  level inside an existing folder is allowed; invalid offers show their reason
  and cannot be picked. Existing titles and taken addresses have no create offer.
- Picking a page fills a component's slots from its content: title, description,
  image, address and matching text. Plain collection items get their title and
  link filled. A card with no link for its page (no link slot, no page link of
  its own) gets its title's text wrapped in a link to it (no class: the site's
  shared card link rule stretches it over the card); a card component whose CSS
  has no positioned `:host` gets
  `:host { position: relative; }` in the same undo step. Filling closes the combobox
  and leaves the card selected with its normal edit bar. The screen-reader
  status announces
  “Card filled from …”.
- Before filling, a card slot's combobox has a **Card: card-project ▾** chip
  with the same looks as Add card ▾. Each swap is one undo step and carries
  content by role. Content a look cannot show is listed and kept aside only
  while the combobox is open; swapping back restores it, without writing it
  into the HTML meanwhile. Filling or closing the combobox drops it. A linked
  card has no look chip.
- Create page copies a sibling's structure and fills the already placed card.
  **One undo removes the page draft and fill**, restoring the blank card byte
  for byte; **a second undo removes the card**. Redo restores both steps and
  refuses if a file now exists at the new page's path. The fill uses the new
  document directly, before the site's page index has refreshed.
- A selected item's edit bar: **Duplicate** (an exact copy), **Remove**, **Add card**
  (the same as the ghost's button, so it is reachable by keyboard) and, for an
  item that links to a page of the site, **Open page**.
- Anything inside an item (its heading, a paragraph, or the card's own
  template parts) gets **Select card** in its bar, which selects the whole item.

**In the Pages tab**

- Adding a subpage under a URL whose pages a grid lists somewhere shows a
  checkbox, on by default: **Add a card to “Recent work” on Home**. With it the
  page is made from a sibling's structure (as on the canvas) and the card is
  added, as one operation (one undo).
- Deleting such a page asks with **Also remove its card from “Recent work” on
  Home** (on by default); the card goes in the same operation.
- Change URL and Move to already rewrite every root link in the site's pages
  (`rewriteRouteLinks`), so a card's link follows its page (tested).

## The rules

**What a grid is** (`src/page-builder/card-grid.ts`, mirrored in
`src/components/native-preview-runtime.js` "Repeated items"). An element of the page
(not the page root, `<main>` or `<body>`) whose element children include at
least two of one kind: the same custom element, or the same tag and classes
for an `article`, `li`, `div`, `figure`, `a`, `blockquote` or `dd`. The kind
with the most members wins. Sections (a `<section>` or a section component)
are never items; they have their own insert points. Grids inside component
templates are the template's, not the page's, and are not offered.

**What an item is called.** A word from its tag or classes: card, tile, post,
project, member, quote, feature, … (`<card-project>` and `div.card` are
"card"); `li` is "item", `a` "link", else "item". **The grid's name** is the
heading just before it, else the first heading of the section around it, else
its `aria-label` or `id`.

**When a grid lists pages.** Each item's link is its first link to a page
below the top level. When at least two items link to different pages right
under one parent URL other than `/`, and no linked item points elsewhere,
the grid lists pages under that parent.

**A new card in a plain grid** is a copy of the last item, as written (attributes,
indentation, line breaks), put on its own lines after it:

- its title (the `slot="title"` element, else the first heading, else the
  item itself when it is only text) says the new page's title, else the
  component's fallback for that slot ("Untitled project"), else "New card";
- a part that is or holds a link keeps its words with the old title swapped
  for the new one ("Read about Fern & Kettle" → "Read about Oak & Ash");
- every other text part says the component's fallback for its slot ("Project",
  "No description yet."), else a placeholder for its kind ("A sentence or two
  about this card.", "Heading", "New item", "Text");
- its link to the copied item's page goes to the new page, or is emptied
  (`href=""`, which the edit bar flags as "No address") until a page is picked;
- images and other attributes stay as they are.

If the item's markup is not a clean tree (an implied end tag), the copy is
verbatim and the status says its text could not be reset.

**A new page** copies the page the last linked card goes to: its whole
document (head, chrome, sections). Then:

- what all siblings share stays and what each says is reset: with a second
  sibling whose `<main>` has the same text parts (by tag), a part whose text
  is the same in both stays ("The brief", "What we built", "Back to all work",
  a shared contact section) and one that differs is reset; with only one
  sibling, headings below `h1` and parts holding links stay and the rest is reset;
- reset means: the first `h1` says the title; a paragraph "A sentence or two
  about Oak & Ash."; text in a component's slot that component's fallback
  ("Note"); anything else a placeholder for its kind;
- links to the sibling's own URL go to the new one; images stay;
- the head: `<title>` in the sibling's form ("Oak & Ash · Larkspur Studio"),
  the description (and `og:description`) emptied, canonical and `og:url` the
  new page's address (`nativePageMovedUrl`), structured data dropped.

With no sibling page to copy, the new page is made as the Pages tab makes one
(the home page's document with an empty `<main>`).

## Where the code is

- `src/page-builder/card-grid.ts`: the rules above as plain text functions
  (no DOM, unit tested in `tests/card-grid.test.ts`).
- `src/page-builder/card-source.ts`: grids in a page's source, parsed by the
  browser's parser so index paths match the preview.
- `src/page-builder/cards.ts`: the editor side (edit bar controls, adding,
  the Pages tab offer, delete) behind a small dependency object.
- `src/components/card-grid-controls.ts` (+ `.css`): the ghost, its button and
  the combobox over the preview frame; created by `native-preview.ts`, fed by
  the runtime's `item-grids` message. Only the Add button accepts pointer
  events over the canvas; it sits above overlapping section insertion buttons.
- `src/components/native-preview-runtime.js`, block "Repeated items": reports the grid
  under the pointer and around the selection, with where the ghost goes.
  `item-grid-track` keeps the looks gallery's grid live while the pointer is in
  host controls. Scroll, resize, and layout changes refresh its viewport
  geometry; canvas pointerdown releases tracking so selection still reaches
  the clicked element. Closing or destroying the controls releases it too.
- `src/main.ts`: `mountCards()` (the dependencies), one call in
  `renderNativeEditBar`, the Pages tab's `cardOffer`, `createNativeNew` and
  `removeNativePagesTarget`.
- `src/components/pages-tree.ts`: the checkbox (`cardOffer`, `addCard`).

## Tested

- `tests/card-grid.test.ts`: kinds, grids, nouns, linked-page grids, the element
  tree, text parts, card copies (fallbacks, placeholders, optional slots,
  title swap, links), insertion and indentation, page copies (shared vs reset,
  self links), a card link following a URL change.
- `tests/card-page-offer.test.ts`: titles, typed addresses, bounded new folders,
  taken addresses and disabled reasons.
- `tests/card-fill.test.ts`: fill mapping and markup, including empty unnamed slots.
- `tests/native-save/native-cards.spec.ts`, `native-card-paths.spec.ts`,
  `native-card-paths-starter.spec.ts` and `native-add-card.spec.ts`: card-first
  linking and creation, sibling structure, draft existence, Open page,
  byte-for-byte undo of fill and then card, page addresses, and the ghost's
  geometry and collision controls.

`fixtures/native-starter` was not changed: its cards link to no subpages, and
adding pages to it would change page counts other suites assert. The new
fixture repository is additive.

## Known gaps

- Undoing the creation drops the new page's draft even if it was edited since
  (only when undo reaches back to that step).
- Items are found in the page's own markup only; a grid inside a component
  template is the template's and is not offered.
- Duplicate copies an item exactly, including its link; Add card is the clean copy.
- Cards can be reordered by dragging them; only whole sections move with the
  edit bar's arrows or Alt+↑/↓.

Section insertion controls measure the actual Add-card button
rectangle after layout. Only a colliding section plus moves to the nearest
available horizontal position; other gaps keep their normal placement. If no
position fits, that plus stays out of pointer interaction until keyboard focus
or its panel opens, when it is shown above the obstruction. Section drag targets
retain their normal geometry. Layout notifications are coalesced into one
animation frame and removed with the controls; scroll/runtime reports and resize
updates refresh the measured positions.
