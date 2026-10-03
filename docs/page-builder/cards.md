# Cards: grids of repeated items and their pages

A grid of cards that link to subpages is a collection, like a Webflow CMS
collection or a Framer CMS list, with no data file: **the grid's markup and
the subpage files are the collection.** Adding to it writes one card into the
page's HTML and, when asked, one new page file beside its siblings. Both are
drafts like any other edit, readable in the code pane as they happen.

## What the user can do

**On the canvas**

- Hover any item of a grid or list (a card, a list item, a link in a row): a
  dashed ghost shows where one more item would go, after the last one
  (beside it when there is room in the row, else at the start of the next row,
  or below it in a list), with **+ Add card** (Add item, Add link…) in it.
  The ghost also shows while an item, or anything in one, is selected.
- For a plain grid, Add card adds a copy of the last item with its text reset
  (see below), selected, as one undo step.
- For a grid whose items link to pages under one URL (`/work/fern-and-kettle/`,
  `/work/harbour-lane-pottery/`), Add card opens a small popover: the new
  page's **title**, the URL it gets (`/work/oak-ash/`, checked live: a taken
  URL says so), **Create page and card** (Enter) and **Card only**. Creating
  writes `work/oak-ash/index.html` and a card linking to it, titled, after the
  last card; the card is selected. **One ⌘Z takes both back**, redo brings
  both: the card is an edit in the page's editor and the page's draft goes
  and comes back with it (a history companion, `replaceActiveRange(…, companion)`).
- A selected item's edit bar: **Move left / Move right** (Move up / down in a
  list; Alt+↑/↓ too), **Duplicate** (an exact copy), **Remove**, **Add card**
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
`public/native-preview-runtime.js` "Repeated items"). An element of the page
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
the grid is that parent's collection.

**A new card** is a copy of the last item, as written (attributes,
indentation, line breaks), put on its own lines after it:

- its title (the `slot="title"` element, else the first heading, else the
  item itself when it is only text) says the new page's title, else the
  component's fallback for that slot ("Untitled project"), else "New card";
- a part that is or holds a link keeps its words with the old title swapped
  for the new one ("Read about Fern & Kettle" → "Read about Oak & Ash");
- every other text part says the component's fallback for its slot ("Project",
  "No description yet."), else a placeholder for its kind ("A sentence or two
  about this card.", "Heading", "New item", "Text");
- a part in a slot the component shows only when filled (`data-if`) is left
  out, so the new card hides it, as a new instance would;
- its link to the copied item's page goes to the new page, or is emptied
  (`href=""`, which the edit bar flags as "No address") for Card only;
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
  the popover over the preview frame; created by `native-preview.ts`, fed by
  the runtime's `item-grids` message. Only the Add button accepts pointer
  events over the canvas; it sits above overlapping section insertion buttons.
  The popup prefers available space beside its anchor and scrolls internally
  when the frame cannot fit its height.
- `public/native-preview-runtime.js`, block "Repeated items": reports the grid
  under the pointer and around the selection, with where the ghost goes.
  `item-grid-track` keeps the open popup's grid live while the pointer is in
  host controls. Scroll, resize, and layout changes refresh its viewport
  geometry; canvas pointerdown releases tracking so selection still reaches
  the clicked element. Closing or destroying the controls releases it too.
- `src/main.ts`: `mountCards()` (the dependencies), one call in
  `renderNativeEditBar`, the Pages tab's `cardOffer`, `createNativeNew` and
  `removeNativePagesTarget`.
- `src/components/pages-tree.ts`: the checkbox (`cardOffer`, `addCard`).

## Tested

- `tests/card-grid.test.ts`: kinds, grids, nouns, collections, the element
  tree, text parts, card copies (fallbacks, placeholders, optional slots,
  title swap, links), insertion and indentation, page copies (shared vs reset,
  self links), a card link following a URL change.
- `tests/native-save/native-cards.spec.ts` on the `native-cards` fixture
  (`fixtures/native-cards`, id 540: a home page whose cards link to two pages
  under `/work/`, and a plain list): Add item on a list and its undo; New page
  and card (the popover, a taken URL, the card and page written, selected,
  Open page, one undo and redo for both); Select card, Move left/right,
  Duplicate, Remove, Card only; the Pages tab checkbox, delete with the card,
  and Change URL rewriting the card's link. Regressions cover overlapping
  section controls with `elementFromPoint`, popup and ghost geometry after
  iframe scroll, outside selection and dismissal, Escape focus, and rejected
  reports from an earlier source context.

`fixtures/native-starter` was not changed: its cards link to no subpages, and
adding pages to it would change page counts other suites assert. The new
fixture repository is additive.

## Known gaps

- Undoing the creation drops the new page's draft even if it was edited since
  (only when undo reaches back to that step).
- Items are found in the page's own markup only; a grid inside a component
  template is the template's and is not offered.
- Duplicate copies an item exactly, including its link; Add card is the clean copy.
- Drag to reorder items is not done (Move and Alt+↑/↓ are).

Section insertion controls measure the actual Add-card button and open popover
rectangles after layout. Only a colliding section plus moves to the nearest
available horizontal position; other gaps keep their normal placement. If no
position fits, that plus stays out of pointer interaction until keyboard focus
or its panel opens, when it is shown above the obstruction. Section drag targets
retain their normal geometry. Layout notifications are coalesced into one
animation frame and removed with the controls; scroll/runtime reports and resize
updates refresh the measured positions.
