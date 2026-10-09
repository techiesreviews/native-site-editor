# Page builder (dev branch)

The `dev` branch turns the visual side of the editor into a page builder, tried out at
https://preview-editor.techies.tools before anything reaches editor.techies.tools. Ideas
are borrowed from Webflow (Add panel, navigator, breakpoints), Framer (insert menu with
live thumbnails, canvas that feels like a design tool) and Etch (native HTML and CSS,
code always one step away). The page builder stays native:

- **Static output is the goal.** Lex clarified on 2026-10-04 that the editor is an
  easier way to create and modify static native HTML pages, with JavaScript used
  only where needed. A direct HTTP test of the current starter with JavaScript
  disabled loses the header/footer and component styling. Its native component
  loader is therefore an unresolved rendering dependency. A separate ordinary
  HTML/CSS composition prototype is being tested; it is not integrated yet.
- **The source is the truth.** Every visual action is one readable edit to the site's
  own HTML or CSS files, shown in the code pane as it happens. Nothing is written that a
  person would not write by hand: no editor ids, no data attributes, no generated class
  soup, no runtime in the site ([ADR 0001](../adr/0001-the-repository-is-the-site.md)).
- **Code is never hidden.** Whatever the canvas selects, the code pane can show; whatever
  a panel is about to insert can be read as HTML before it is inserted.
- **Assume nothing about the site.** Features work from what the repository already has
  (its components, its pages, its repeated markup) and degrade quietly when it has none.

## Feel

- Direct manipulation first: drag, click, type on the canvas. Panels support it.
- Fast and calm: motion 120–200 ms ease-out, no bounce; respect `prefers-reduced-motion`.
- Every action undoes with ⌘Z (it is a source edit, so the editor's undo covers it).
- Keyboard reachable: every control focusable, Esc closes, arrows move in lists.
- One look: use the tokens in `src/theme.css` and the rules in `docs/editor-colors.md`
  (panel surfaces, `--current`, `--pressed`, sizes, 12/13/15 px type). Components get a
  single distinct accent across the editor (outline, chip, structure icon):
  `--component` in `src/theme.css` (a violet in both schemes, contrast-checked).

## Slices

Each slice writes its notes in this folder (`<slice>.md`): what it does, how to use it,
what was tested. `docs/NATIVE-PROJECT.md` gets one summary line per slice at merge.

## Wave 2: a full website builder

Wave 1 (cards, Add panel, components, canvas, palette) makes the editor feel like a page
builder. Wave 2 covers what a site builder needs beyond that, still without a build step
or editor runtime in the site.

### Static cards and section authoring

Cards are ordinary HTML in static grids. Add card copies a card and can create a
linked page in the same undo step.

Styling, image positioning and grid layout are edited in the Source editor.
Visibility per breakpoint is CSS (`@media … { .x { display: none } }`). Empty section slots and wrappers hide automatically.

### Wave 2 slices

- **elements**: inserting inside sections: heading, text, image, button, list, columns
  or grid, video or embed, divider, and native forms (`<form action>` with fields).
  Insertion inside sections was removed on 2026-09-25 at Lex's request, so this slice
  is back on Lex's request for a complete page builder (2026-10-03), designed after
  `ux-research.md`: the destination in words, one insertion system, `/` while typing,
  Move before/after/inside.
- **site**: navigation built from pages, page settings (SEO, social, favicon, 404), and
  CSS-first interactions (scroll reveal with `animation-timeline: view()`, hover
  presets).
- **media**: an image manager: every image in the repository with thumbnails, search,
  tags and default alt text (kept in `.editor/media.json`), "Used on N pages", and
  uploads optimised in the browser (resize, WebP, metadata stripped, responsive
  `srcset` variants) before they become drafts.
- **component content on the canvas**: empty optional slots show as ghost placeholders
  ("+ Add image", "+ Add text") where they would appear; click an image to replace it,
  drop a file on it, remove an optional part with its ×, type into text in place.

Page settings provides General, Search and Social.
