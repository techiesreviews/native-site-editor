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
content, custom elements, repeated attributes, `on*` and recipe attributes,
and a second link or image.

## Planning (`planStaticCardConversion`)

Input matches the custom-element grid conversion (`sources`, `routes`,
`identity`, `path`, `start`, `folders`, `token`) plus optional `sort`,
`filter` and `limit`. Each part uses the linked page's own value
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
refused. It returns the full new texts (page and page data file) and the
texts those files must still have when the change is applied.

## Known limits

- The bake writes cards one per line, so the indentation between cards in
  the grid changes on conversion. The cards themselves do not.
- A new card whose page gives no value for a part without a fallback (a
  card note, say) omits that element, leaving its indentation as a blank
  line.
