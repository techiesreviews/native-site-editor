---
title: Decide what remains after the style panel, collections and Page Fields are removed
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: []
---

## Question

Once the style panel, collections and Page settings › Fields are gone (no compatibility, decided while charting), what is left and where does it live?
- Does `.editor/page-builder.json` still have a job (`pages.sections`?), or does the file go?
- Where do the shared helpers move: `attribute()` (`collection-model.ts:23`, used by 7 modules), `makeCollectionTarget`/`locateCollectionTarget` (used by `native-section-links.ts`), and `builtinFields`/`fieldName` (used by `native-page-fields.ts`, which may go too)?
- Do the "generated" row state in `page-structure.ts` and the `asset-references.ts` hooks go?
- Which docs are deleted and which are edited (`panel-collapse.md`, `cards.md`, `completion-checklist.md`)?
- In what order do the removals land, so that Add card (`cards.ts:22-23`, `:138-161`, `:307-314`, `:354-361`; `main.ts:5735`) keeps working throughout?

Scout inventory: style panel about 1,850 source and 2,100 test lines; collections about 3,700 source lines (600-800 of them in `main.ts`, including `applyNativeCollectionOperation` with about 20 call sites) and 5,900 test lines.

## Resolution (2026-10-06)

Decided with Lex.

1. `.editor/page-builder.json` stays, with `pages[path].sections` only (shared sections, page parts, section links, Add card). `collections` and `pages.fields` leave the type and are stripped from the file on the next write. No version bump.
2. `attribute()` and `makeCollectionTarget`/`locateCollectionTarget` move to a neutral module (e.g. `page-builder/source-target.ts`), renamed `makeSectionTarget`/`locateSectionTarget`. `builtinFields`/`fieldName` are deleted with `native-page-fields.ts`.
3. The "generated" row state in page structure and the collection hooks in asset references go.
4. Collection-only and style-panel-only docs are deleted; `panel-collapse.md`, `cards.md`, `completion-checklist.md`, the page-builder README and `NATIVE-PROJECT.md` are edited to drop references.
5. Order, with Add card working at every step: (1) style panel, (2) extract helpers and decouple Add card from collection code, (3) Page settings › Fields, (4) collections incl. generated rows, asset hooks and the sidecar strip, (5) docs.

**Correction (ticket 14):** point 1 means strip `collections` and `pages[*].fields` and keep everything else (`reusableSections`, `pages[path].sections`, `pages[path].pageParts`). Step 2 of the order also moves the page re-key and link-rebase logic out of `applyNativeCollectionOperation` into the neutral module. The image focal point and grid editor go with the style panel in step 1.
