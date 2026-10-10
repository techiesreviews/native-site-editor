---
title: "One Variant lookup for the editor and the Worker"
type: task (AFK)
status: open
assignee:
blocked_by: []
builder: claude ★
phase: 5
---

## What

The tag→Variants lookup is built four times, from three different sets of stylesheets and scripts: the edit bar (the page's linked sheets, `src/page-builder/components.ts`), the card look gallery (a copy, `src/components/card-look-gallery.ts`), the code pane (every `.css` that is not a component's own, `createVariantLookup` in `src/page-builder/variant-intelligence.ts`) and the Worker's `get_site` (the tab's `EditorContext` stylesheets plus the first 100 scripts, `worker/site-variants.ts`). Agents can see other Variants than the edit bar. Slice 71 (components-and-builder) left "one shared lookup" and "read only the CSS/JS the site links" as follow-ups.

- One deep module in `shared/` answers "the Variants of a tag (and of a class like `.btn`, and the global ones)" for the site. It decides which files count: the stylesheets the site's pages link, with their `@import`s, plus each component's own CSS (imports expanded); the scripts the pages link, with their static imports, for the attributes scripts set. It caches its answers by the texts it read.
- The seam is a small files adapter (the site's pages and components; read a file). Two adapters: the editor's drafts (sync, a file not read yet is read in the background and the panes refresh) and the Worker's `SiteFiles` (read in rounds, batched).
- All four callers move onto it; their copies go. Tests go through the module's interface with a memory files adapter and replace the old partial suites.
- Behaviour stays the same for the starter and the fixtures, except that agents see exactly the editor's Variants; any case that changes is listed in the Done note.

## Done when

- `npm run check`, `npm test`, the full `native-save` suite and the `@actual` group are green.
- Preview deployed from `dev`.
