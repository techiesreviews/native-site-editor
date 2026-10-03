# Collections and page fields

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
the complete element when absent. Conditions outside loop templates remain intact;
component conditions keep their existing meaning. Source outside collection
contents and the retained template remains unchanged, including CRLF line endings.

The panel distinguishes Page fields from Collection template scope. Make this grid
a collection starts with the selected grid's first item as its editable design.
Source checkboxes, sorting, exact filter and limit controls update a plain-HTML
preview and visible result count before Apply. Sources are discovered from eligible folder
routes with subpages; existing selected deeper folders remain available even
without an index route. Zero selected sources clears preview and disables Apply
with an explanation. Checkbox order determines serialized source order. Existing
collection items offer Edit page, separately from Edit card design in source. The panel keeps an immutable source,
route, identity and repository revision snapshot; stale controls reject Apply.

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
- `expectedSources`: every readable route page used by the plan;
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
