# Native static card grids

`src/page-builder/native-static-grid-collection.ts` turns a hand-written grid
of ordinary HTML cards into a page collection. It is a pure model: it plans
and proves the change, and writes nothing. No host UI uses it yet.

The native static starter's project cards are the reference shape:

```html
<div class="cards">
  <article class="card-project">
    <p class="card-note">Cafe · Identity and site · 2025</p>
    <h3>Fern &amp; Kettle</h3>
    <p class="body">A one-page site with a menu …</p>
    <p class="actions"><a href="/work/fern-and-kettle/">Read about Fern &amp; Kettle</a></p>
  </article>
  …
</div>
```

## What the site keeps

The page keeps plain, finished HTML. The recipe (folders, sort, filter,
limit, the card template and per-card overrides) is stored only in
`.editor/page-builder.json`, through the existing `planSidecarRecipe`, and
the cards are written by the existing sidecar bake (`planDocumentBake`),
which drops the recipe's `data-if` conditions from published cards. Nothing
is added to the site: no template, no data attributes, no script.
Stylesheets are never written.

## Reading a grid (`readStaticCardGrid`)

A grid is an element with two or more child cards of one tag and one start
tag, with only whitespace between them. In each card:

- every element whose content is only non-blank text is a part: the first
  heading is the title, the first `<p>` with class `body`, `description`,
  `summary` or `excerpt` is the description, and any other is a custom part
  named after its first class (else its tag);
- exactly one `<a href>`, with plain text, is the card's page link;
- at most one `<img>`, with a safe `src`, is its image (`src` and `alt`).

Every card must have the same tree, start tags and other text; only part
text, the link's `href` and the image's `src`/`alt` may differ. Refused:
text mixed with markup, comments, braces, scripts and other embedded
content, form controls, custom elements, repeated attributes, `on*` and recipe attributes,
and a second link or image.

## Planning (`planStaticCardConversion`)

Input matches the custom-element grid conversion (`sources`, `routes`,
`identity`, `path`, `start`, `folders`, `token`) plus `files` and optional
`sort`, `filter` and `limit`. `files` is the complete file list of one
snapshot of the site, loaded or not, binary files included. Every loaded
file and route must be in it, and every HTML page and the page data file in
it must be loaded; a partial snapshot is refused. Each part uses the linked page's own value
(`{title}`, `{description}`, `Read about {title}`, `{url}`, `{image}`) when
every card shows it, else a per-card override field named
`<token>-<part>`, with the page's value as the fallback where there is one.
A page title whose brand tail is not the site name differs from the card,
so it is kept as an override.

Refused: links outside the site or to pages that do not exist, to the page
itself, or to pages not loaded; two cards linking to one page; folders, a
filter or a limit that would drop a current card; and a sort or route order
that would reorder the current cards. New pages in the chosen folders become
new cards.

The plan is proved with the real bake: the page outside the grid must be
unchanged and every current card byte for byte the same, or the plan is
refused. It returns the full new texts (page and page data file), and the
snapshot it read so the host can guard it:

- `expectedSources`: every HTML page and the page data file, with the text
  read (`undefined` when the page data file does not exist). This covers
  the linked pages, every page in the chosen folders (a new card's title,
  description or a filter field) and the pages scanned for older recipes.
- `expectedFiles`, `expectedRoutes`, `expectedIdentity`: the file list,
  routes and site name.

The host applies the plan only while all of these still hold, and plans
again otherwise. The host owns how it reads the snapshot and its revision.

## Known limits

- The bake writes cards one per line, so the indentation between cards in
  the grid changes on conversion. The cards themselves do not.
- A new card whose page gives no value for a part without a fallback (a
  card note, say) omits that element, leaving its indentation as a blank
  line.

## Collection settings panel

`src/components/collections-panel.ts` opens a selected grid of ordinary
cards in the existing inline collection settings, after the custom-element
card branch (`openManualGrid`), which is unchanged. The host still has to
hand the panel such a grid (`openGrid(path, start)` or the `grid` option)
before users can reach it.

- Every folder a current card lives in starts selected; any other folder
  with pages on the site can be checked or typed into the small "Add
  folder" field, which suggests the site's folders.
- Refusals are shown inline with the model's reason, and nothing is
  applied. The panel reports how many pages will show, that all current
  cards stay as they are, and which card text is kept in the editor's page
  data.
- Convert is the only action that applies. It sends one `SidecarOrigin` to
  `deps.apply`: the page, and the page data file when it exists, are edits;
  the page data file is created only when it is absent. `expectedSources`
  pins every page the plan read and the page data file.
- The panel needs `deps.files()`, the complete file list; without it, the
  grid is refused. The snapshot it plans against includes the file list,
  routes, site name and revision, and Convert refuses without writing if
  any of them, or any source, changed since the panel opened.
