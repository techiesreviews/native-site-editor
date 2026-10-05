# Native page parts (model)

A site's header and footer repeat on every page. Page parts let the editor keep one master for
them and update the copies on request, while every page stays complete, plain HTML and CSS.
Deleting `.editor/` leaves a working site: nothing here is a loader, a framework, or a marker or
attribute in published HTML.

Status: pure model and unit tests (`src/page-builder/native-page-parts.ts`). No UI, no Undo
wiring, no preview bridge yet.

Saved sections (`native-section-masters.md`) stay `<section>`-only. Page parts are a separate,
typed kind and don't change what Add offers.

## Data

- `.editor/page-parts/<id>.html`: the master, the only authority for the part's HTML. It holds one
  complete `<header>` or `<footer>`, with only whitespace and comments around it.
- `.editor/page-builder.json`:
  - `reusablePageParts: { version: 1, records: { <id>: { id, label, rootTag, rootClass, htmlPath, stylesheetPath } } }`.
    `rootTag` is `header` or `footer`; `htmlPath` is always the master path; there is no `html`.
  - `pages[path].pageParts[key]: { kind: "native-page-part", recordId, target, basis }`: a link from
    one copy to its record. `target` is `makeCollectionTarget`'s locator (authored id, else tag and
    exact opening tag); `basis` the literal bytes the copy was linked or last updated from.
  - Unknown keys in records, links, containers, pages and the top level are kept, and so are
    entries of other kinds, collections and section links.

## API

- `readPagePartCatalog(json)`, `readPagePartLinks(json)`: stored data; malformed recognised data refuses.
- `readPagePartMaster(record, { files, sources })`: the master's text, checked.
- `resolvePagePartLinks({ documentText, sources })`: every link located in loaded pages, with `unchanged`.
- `planSavePagePart(input)`: the selected header/footer becomes a new part. Creates the master
  with the copy's exact bytes and adds the record and this copy's link in one operation.
- `planLinkPagePartCopies(input)`: links copies on other pages. The basis is the master's part, so
  a copy that differs (an `aria-current` for its own page) is customised from the start.
- `planUpdatePagePartCopies(input)`: writes the master's part into every copy still equal to its
  basis and moves those bases; customised copies are skipped and reported.
- `planUnlinkPagePart(input)`: removes one link (JSON only).

Writes: Save writes the JSON and the master; Link and Unlink only the JSON; Update the pages and the
JSON. CSS is never written.

## Guarantees

- Every plan pins the exact bytes it read (or their absence) and the sorted file graph: the JSON,
  the master, each page, and for Save and Link the stylesheet with every sheet on the loaded
  link/import chain that proves the page applies it.
- The part's HTML follows the static section policy: ordinary elements, links, navigation and
  images; no scripts, event handlers, `javascript:` URLs, embedded styles, custom or foreign
  elements, templates, editor attributes, duplicate ids or duplicate attributes. Refused, never
  sanitised.
- URLs must work at every page depth, since a part is copied to pages in different folders. A
  page-relative URL (`contact/`, `../images/a.png`, `?page=2`) in `href`, `src`, `srcset`, `poster`,
  an inline-style `url()`, or a form `action`/`formaction` is refused with a request for a root path
  (`/contact/`). Root paths, `#fragments`, `//host` and scheme URLs are accepted; an empty `href`
  (the page itself) too. Nothing is rewritten. Save, Link and Update all check the copy or master.
  Other attributes holding URLs (`cite`, `background`, `longdesc`) aren't checked. The existing
  insert policy still refuses `srcset` lists and `data:` URLs in attributes.
- A master with a comment outside its root is refused by Link as well as Update.
- A part inside a component, template, foreign markup or another header/footer is refused. Links
  may not overlap each other, a section link or a collection; a missing or ambiguous link refuses
  the whole update. Ids, master paths (any case) and root classes (across parts and saved
  sections) can't collide; nothing is overwritten.

## Limits

- Two copies with the same opening tag and no id on one page can't be told apart; give one an id.
- A copy whose opening tag was edited (and has no id) is lost until relinked.
- The JSON is re-serialised: its meaning is kept, not its formatting.
- The stylesheet isn't checked for rules using the root class.

## Next

- Controller: explicit Save as shared header/footer, Link copies, Edit master, Update copies and
  Unlink, each applied as one Undo by the host (`main.ts`), following the section master controller.
- Preview bridge: editing a master in place needs the master preview bridge to accept a
  header/footer root, not only `<section>`.
