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

### Collections: editor recipes, ordinary website HTML

Lex clarified the storage contract on 2026-10-04: editor-only page, section and
collection information belongs in deletable `.editor` JSON. Collection recipes,
bindings, filters and custom authoring fields must not be embedded in published
HTML. This supersedes the earlier `data-each` and inline `<template>` design.
The existing implementation still uses that legacy format; migration is active
work, not a completed feature.

The editor writes finished cards into the page as ordinary HTML. Published pages
must require no collection renderer, framework compiler or editor build step.
Deleting `.editor` must leave the rendered website working; it removes authoring
recipes, not the website's content.

- Collection sources can combine folders such as `/work/`, `/services/`,
  `/portfolio/`, `/articles/` and `/videos/`.
- Real page content and useful SEO remain in HTML. Custom editor fields, collection
  bindings, sort/filter/limit settings and section bookkeeping belong in `.editor`.
- Changes to recipes and affected website files must save and undo together.
- Classes, links, image attributes and the site's native Web Component slot
  attributes remain functional website source.

`<template>` itself is a browser standard. It does not render its contents without
JavaScript. Its native status does not make our binding expressions a browser
feature; collection authoring expressions belong only in the editor's recipes.

### Conditions

- Editor collection conditions are evaluated before writing finished HTML. No
  collection condition interpreter is required on the published website.
- Visibility per breakpoint (hide on mobile) is CSS the style panel writes
  (`@media … { .x { display: none } }`), never a script.

Existing native Web Component behavior is a separate part of the site's code.
Migration must preserve its functional attributes and user-authored markup;
removing editor metadata is not permission to strip arbitrary `data-*` attributes.

### Wave 2 slices

- **collections**: loops as above, a fields panel for a page (CMS-like editing of its
  title, description, date, image and custom fields), and "Make this grid a collection"
  for a card grid.
- **style**: a Webflow-like style panel (layout, spacing, size, type, background, border,
  effects) that writes the selected element's class rule in the site CSS, per breakpoint
  and state (`:hover`), with the site's own variables as presets. Plus global styles:
  the site's colour, type and spacing variables.
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
