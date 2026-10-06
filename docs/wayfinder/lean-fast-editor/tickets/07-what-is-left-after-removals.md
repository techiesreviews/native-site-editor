---
title: Decide what remains after the style panel, collections and Page Fields are removed
type: grilling (HITL)
status: open
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
