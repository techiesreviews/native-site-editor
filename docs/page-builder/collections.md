# Collections and page fields

**Storage migration in progress (2026-10-04).** The implementation described below
uses the legacy inline format. Lex's current requirement supersedes that format:
collection recipes and editor-only page/section fields belong in deletable
`.editor` JSON. Published HTML contains finished content, without collection
bindings, authoring attributes or recipe templates. Migration must preserve
ordinary source, existing native Web Component behavior, atomic Save and Undo.
See [the current native contract](README.md#collections-editor-recipes-ordinary-website-html).

For JSON-backed collections, Save collection refreshes literal cards even when the
recipe is unchanged, using the current persisted Code metadata. HTML and the JSON
output fingerprint form one Undo step; Undo keeps any earlier Code edit. Save pins
the loaded source bytes and keys, complete file and route graph, site identity,
selection and editor model state before asynchronous host work. A changed input is
refused rather than silently used as a new basis. Refresh does not authorize
replacing hand-edited cards; that requires the explicit rebuild action.

A page's title or metadata typed in Code rebuilds the cards that list it once the
typing settles: no keystroke for 700 ms, or the file closing. Only a change to
what cards read from the page (its fields, or the site name on the home page)
starts a rebuild; body edits do not. The settle point closes the typing group as
an Undo stop of the page's model, and the rebuilt listing pages and JSON follow
that group instead of taking their own Undo step: undoing the page back to where
the group began undoes the cards too, and redoing to its end redoes them. For a
paste, or a typing group Monaco keeps as one step, that is one Undo for both;
when Monaco splits the group into several stops, the cards go back with the last
of them, so the page and its cards never disagree once Undo reaches the start of
the group. When a rebuild also changes the page being typed (for example,
a home site-name edit changes its own cards), the rebuild instead has a separate
guarded Undo step: first Undo restores the old cards and JSON while retaining
the typed page fields; second Undo restores the typing group. Redo replays the
typing group, then the rebuild, with exact source/model checks. The journal
records the existing native typing stops beneath that action, including groups
with several native stops. This requires that page to remain mounted in Code;
a file switch before application refuses the rebuild. Later typing still clears
the compound journal safely, and receipt boundaries prevent a partial raw Undo.
The rebuild pins the page at the settled text and the whole graph
like any collection operation. Typing on, Undo, a branch switch or any other
change before it is written refuses it without writing; a rebuild refused because
typing went on is planned again from the earlier start at the next settle. Inline
listings on other pages are checked for hand edits against the page's text from
before the typing group (their cards were made from it); JSON collections use
their recorded output. Hand-edited cards are never replaced; the status line says
why. When a paired Undo or Redo cannot restore the cards exactly (a listing page
changed, or was opened and got a new editor model, since), the page still moves
and its cards are rebuilt from it through the same guards, checked against the
text they were made from; that rebuild has no Undo step of its own and may write
the editor's JSON in its canonical key order. Save collection stays an explicit action.

An inline listing whose own recipe cannot be read or baked (an unknown field, a
malformed folder, a missing template), or a collection in a valid editor JSON
document whose target or recipe cannot be baked, no longer blocks unrelated page operations.
Each operation bakes the healthy listings and leaves a broken one byte for byte; the
status line names the listing's page and its reason. An operation that touches the
broken listing is still refused with that reason: a change to its own page (an edit
or a move; deleting the page removes the listing and goes ahead), or a change to what its
folders select (a selected page's fields, URL, existence or page data, including a
folder relocation). A listing whose folders cannot be read selects nothing, so only
its own page counts. Skipped JSON recipes and their cards stay unchanged while
healthy collections on other pages still bake. Invalid JSON syntax or schema
still refuses the whole operation; the editor never discards unreadable page data.


A collection lives in a page's HTML. `data-each="/work/"` selects pages strictly
below that folder. A mixed collection uses an HTML ASCII whitespace token list,
for example `data-each="/work/ /services/ /portfolio/ /articles/ /videos/"`.
Every token must be a canonical absolute folder URL ending in `/`; empty lists,
encoded segments, hidden segments, wildcards and expressions are rejected. Duplicate
folders retain their first position. The union excludes every selected folder
index, the listing page itself, the root not-found page and hidden routes. Nested descendants count. The container must
have exactly one direct-child `<template>`. The editor retains that template and
replaces the container's other content with ordinary HTML for the matching pages.
The published site needs no collection script or data file. The native authoring
attribute and template remain alongside ordinary baked cards.

```html
<div class="cards" data-each="/work/" data-sort="-date" data-limit="3">
  <template>
    <article>
      <a href="{url}">{title}</a>
      <figure data-if="image"><img src="{image}" alt="{title}"></figure>
      <p>{description}</p>
    </article>
  </template>
  <!-- Ordinary generated cards go here. -->
</div>
```

Page fields come from the page itself: title without the configured site suffix,
falling back to the first heading; description metadata; `og:image`; date metadata
or the first time element's `datetime`; the page URL; and custom metadata named
`field:category`, `field:price`, and so on. The page-fields form changes metadata,
then includes dependent listing edits in the same plan. Changing an address stays
in the Pages flow. Custom field names use lowercase letters, digits, underscores
and hyphens, starting with a letter; built-in names are reserved.

All page types share the canonical fields `title`, `description`, `image`, `date`
and `url`, plus custom metadata fields. A field defined only in a secondary source
is known throughout the union; `data-if` can omit wrappers where it is missing.
Overlapping roots produce one card per page. Every selected folder index is
excluded, including a selected nested index beneath another selected root.
Filtering, stable sorting and the limit run once across the complete union.

Sorting accepts a field name or `-date` for descending order. Equal values retain
route order. Filters are exact, case-sensitive `field=value` matches. Limits range
from 1 to 500; omitted limits cap output at 500 items. Missing optional fields bind
to empty text. Unknown fields, invalid settings, nested loops/templates, incomplete
or mismatched template tags, and malformed bindings reject the entire plan.

Bindings work in text and ordinary attribute values, with independent HTML text
and attribute escaping. URL bindings permit relative URLs and HTTP/HTTPS, rejecting
script/data schemes and protocol-relative URLs. Binding event attributes, inline
style, srcdoc, srcset or raw script/style/textarea/title contents is rejected.
Comments remain literal. `data-if="image"` tests nonblank field presence and omits
the complete element when absent; `data-if="!field"` renders the element only when
the field is blank. Negation exists only in native collection templates, not in
component template conditions. Conditions outside loop templates remain intact;
component conditions keep their existing meaning. Source outside collection
contents remains unchanged. Reapplying a collection retains template wrapper attributes
and unchanged template body bytes, including CRLF line endings. Whitespace outside
the template but inside the collection is replaced by the bake; changed template
text follows textarea line-ending normalization.

The panel distinguishes Page fields from Collection template scope. Make this grid
a collection starts with the selected grid's first item as its editable design.
Source checkboxes, sorting, exact filter and limit controls update a plain-HTML
preview and visible result count before Apply. Sources are discovered from canonical parent and ancestor folders of eligible
page routes, even without folder index pages. Root is not offered automatically.
Existing configured folders remain available even when temporarily empty. Zero selected sources clears preview and disables Apply
with an explanation. Existing selected folder order is retained, followed by discovered folders.
Checkbox order determines serialized source order. Existing grids use Edit collection
and Save collection controls; summaries separate folder URLs with commas. Existing
collection items offer Edit page, separately from Edit card design in source. The panel keeps an immutable source,
route, identity and repository revision snapshot; stale controls reject Apply.

### Choosing pages for a hand-written card grid

Ordinary HTML cards, including the native static starter's `.cards > article.card-project`,
also expose Collection in Style when a card or its content is selected. Convert keeps each
existing card's literal bytes, stores its recipe and any card text overrides in
`.editor/page-builder.json`, and bakes complete HTML cards into the page. It may normalise
whitespace between cards. Choosing additional folders adds their pages using the existing
card shape. Page metadata and other JSON data stay intact; conversion is one Undo/Redo step.
Opening the controls or changing folder choices writes nothing. A source or scope change
after the controls opened refuses the stale conversion.
Declared card fields keep explicit friendly labels in the recipe's private `fieldLabels`
metadata, so Sort and Filter display “Card note” while retaining the exact field key.
Those labels survive Save and reopening; older recipes retain their existing label fallback.

The native-starter browser proof runs directly with
`STATIC_SECTIONS_FIXTURE=native ASE_NATIVE_SAVE_FIXTURE=<native-static-preview> ASE_TEST_PORT=<free-port> npm run test:browser -- tests/native-save/native-static-grid-collection-host.spec.ts`.

A grid of two or more same-tag custom-element cards without `data-each` offers
"Choose pages for this grid" (`src/page-builder/native-grid-collection.ts`). Opening it
or changing folders writes nothing; Apply converts the grid, the linked pages' fields
and the baked output as one native operation and one Undo step. Each card must link
to a distinct page of this site, and every part must be a named slot with plain text.
Title and body parts use `{title}` / `{description}` when they match the page; otherwise
the card text is stored as a custom page field `<id>-<slot>` on that page, with a
`data-if="!<id>-<slot>"` fallback to the built-in. The id is persisted as
`data-collection-id` on the grid. SEO title and description are never rewritten.
Conversion is refused, with a readable reason and no writes, for rich or image parts,
mixed card shapes, external or duplicate links, folders that would drop a current
card, or cards in a custom order that page order would change. The grid also persists
its custom field names in native `data-fields`, an ASCII-whitespace-separated list. This
keeps those exact names valid when the last page supplying a value moves or is
deleted. Declarations apply only to that grid; undeclared or misspelled names still
fail validation. The list is additive: unused declarations remain until the author
edits the attribute. Existing collections without a list are not changed automatically.
Sort and filter controls show friendly names such as “Card note”
while retaining the stored field name. Native planning and actual-starter browser
tests cover the schema and labels; the last-supplying-page deletion is covered at
the native-operation planning layer.

## Host integration contract

`mountCollectionsPanel(host, deps)` returns `update()`,
`openGrid(pagePath, sourceStart)` and `destroy()`. The host supplies sources, routes,
site identity, a scope/generation revision, the open page, navigation, announcements
and `apply(plan, expectedRevision, label)`. The panel never writes drafts or models.

`collectionSpec` accepts a compatible `folder` string or an ordered `folders`
array. The result exposes `folders` and a `folder` string serialized with one ASCII
space between URLs. Legacy single-folder serialization stays exactly `/work/`.
`makeGridCollection` accepts either form and safely serializes native `data-each`.

`planBake(sources, routes, {name})` returns either `{error}` or:

- `edits`: source range edits grouped by page path;
- `expectedSources`: every eligible route page, including pages outside selected
  folders; all must be loaded before planning succeeds;
- `collections`: item records, retained template and generated output for previews.

`planCollectionChange(before, after, routes, identity)` composes a page-field or grid
conversion with dependent bakes, producing nonoverlapping full-file edits checked
against `before`. `applyCollectionEdits` applies range edits in descending order.
The host must verify the revision and every expected source again immediately
before applying, including after asynchronous prefetch or draft preparation.
Apply every affected page as one visual history action, with a companion that
restores dependent drafts on Undo/Redo in their original scope and by owned draft
identity. Never overwrite later agent edits or another repository's drafts.

Page add, rename, move, delete, metadata changes and template changes should build
an in-memory candidate source/route graph, call `planBake`, and combine the result
with the originating operation before publishing any drafts. Any bake error must
abort that complete operation. Automatic listings must not also receive a manual
card. Bound output selection should navigate to the source page field, while card
design editing targets the retained template. These hooks and selection routing
belong to main/runtime integration and are pending; the leaf modules do not install
them implicitly.

## Validation

`tests/collection-bake.test.ts` exercises metadata/entities, strict routes, stable
sorting, filters, conditional wrappers, contextual escaping, unsafe URLs, malformed
and nested templates, all-or-nothing errors, CRLF preservation and composed plans.
`tests/native-save/native-collections.spec.ts` mounts the real leaf panel against a
guarded in-memory host: preview, field-plus-listing plans, binding errors and stale
source/scope/routes. These browser checks validate the controller, not production
host history or automatic page-operation hooks. Full host browser coverage remains
required after integration.

Local validation uses `site-head.ts` and `html-entities.ts` from site slice commit
`e3cfcd7`; those shared helpers are dependency copies and are not part of this leaf
commit. Integrate that slice alongside collections.
