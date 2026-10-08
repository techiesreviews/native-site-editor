---
title: Inventory the shared masters, page parts and components in use
type: research (AFK)
status: closed
assignee: claude (research subagent)
blocked_by: []
---

## Question

Before deciding how `.editor/sections` masters convert to components, what exists today? List every `.editor/sections/*.html` master, `.editor/page-builder.json` `reusableSections`/`pageParts`/page `sections` entry, and `components/*/` component in techies-reviews (`~/Projects/techies-reviews`), the starter (`~/Projects/native-site-editor-starter`) and `fixtures/`. For each master, say which pages use it and whether it would convert cleanly to a custom element with whole-element slots. Map every place in the editor and the Worker that reads or writes masters (`nativeSharedRoot` in `src/main.ts`, `planNativeSharedSection`, `planSavePagePart`, sidecar code, MCP `add_section`, `worker/site-conventions.ts`) and what breaks when they go. Also note what a header/footer loses as a component when JS is off (nav links that live only in a shadow template), and whether slotting the nav links keeps them in the page HTML.

## Resolution (2026-10-08)

Full findings: branch `research/cb-01-masters-and-components` (commit b4086e2), file `docs/wayfinder/components-and-builder/research/01-masters-and-components.md`.

1. **No real masters exist.** There is no `.editor/sections/`, `.editor/page-parts/` or `.editor/page-builder.json` in techies-reviews, the starter, `fixtures/`, lexvd-site or dogsfitandfun, now or in their history. The masters code was added to `dev` on 2026-10-04/05 and never reached `main`. Retiring the masters is therefore code removal, not data conversion.
2. **Size of the removal:** about 3,140 lines across 15 modules (counted) plus about 850 lines in `main.ts` (estimated). It also removes about 139 unit tests and about 71 browser tests, including three Playwright projects. `.editor/page-builder.json` and the code that updates it when pages move have no other user, so both go. Add card does not depend on them.
3. **The Worker and MCP never touch masters.** Only wording changes: `site-conventions.ts:52` says headers and footers have no slots, and `:69` contradicts `:58` about registering tags.
4. **Components in use:** techies-reviews has 16 tags on 106 pages (header on 98, footer on 104); the starter has 9 tags on 6 pages. Every live template already wraps whole elements in its slots. Only the frozen fixtures put the slot inside the element.
5. **Make component is hidden** because `main.ts:642` gives the edit bar the masters' "Update saved section" action instead. For text it still puts the slot inside the element (`component-model.ts:1137-1144`).
6. **When a section becomes a component, its CSS must move.** A shared rule like `.intro h2` still styles the template's fallback but no longer reaches slotted content (measured).
7. **With JS off, today's header and footer show no links** on either site, not even the skip link (measured in Chromium).
8. **Slotting the nav links** (`<a slot="link">` per link inside the template's nav) keeps them in the page HTML, visible without JS and styled. Slotting the whole `<nav>` loses the component's link styling. The cost is that every page carries its own copy of the nav, so a nav change touches 98–104 pages on techies-reviews. This trade-off goes to ticket 02.
