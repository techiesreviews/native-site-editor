# Page builder (dev branch)

The `dev` branch turns the visual side of the editor into a page builder, tried out at
https://preview-editor.techies.tools before anything reaches editor.techies.tools. Ideas
are borrowed from Webflow (Add panel, navigator, breakpoints), Framer (insert menu with
live thumbnails, canvas that feels like a design tool) and Etch (native HTML and CSS,
code always one step away). The page builder stays native:

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

### Loops: collection lists baked into the HTML

A loop is declared in the page itself and its output is plain HTML, so the live site
needs no JavaScript and search engines see every item:

```html
<div class="cards" data-each="/work/" data-sort="-date" data-limit="6">
  <template>
    <card-project>
      <a slot="link" href="{url}">{title}</a>
      <p slot="text">{description}</p>
      <img slot="image" src="{image}" alt="" data-if="image">
    </card-project>
  </template>
  <card-project>…one per page, written by the editor…</card-project>
</div>
```

- **Items** are the subpages of a folder (`/work/`). **Fields** come from each page's own
  head and body, so a page is its own record: `title` (the `<title>` minus the site
  suffix, or the first `h1`), `description`, `image` (`og:image`), `date`
  (`<meta name="date">` or the first `<time datetime>`), `url`, and any
  `<meta name="field:…">` the site adds (`category`, `price`…).
- The editor **re-bakes** the items as drafts whenever a page in the folder is added,
  renamed, moved, deleted or has a field changed, or the template changes. The baked
  items are ordinary markup that a person or an agent could also write by hand.
- `data-sort` (a field, `-` for descending), `data-limit` and `data-filter="category=Pottery"`
  cover the common lists (latest three posts, all projects in a category).

### Conditions

- `data-if="field"` in a loop template keeps an element only for items with that field,
  with the same meaning as `data-if` on slots in the starter's components
  (`components/components.js`).
- Visibility per breakpoint (hide on mobile) is CSS the style panel writes
  (`@media … { .x { display: none } }`), never a script.

Attributes like `data-each` and `data-if` are allowed because they describe the site's
own content and the site works without the editor. They are not editor bookkeeping.

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
  These were removed earlier because the Add picker inserted them badly; this slice
  brings them back with proper placement.
- **site**: navigation built from pages, page settings (SEO, social, favicon, 404), and
  CSS-first interactions (scroll reveal with `animation-timeline: view()`, hover
  presets).
