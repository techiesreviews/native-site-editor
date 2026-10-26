---
title: Decide how pages are rearranged and added in the map
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: [02-research-structure-and-search]
---

## Question

With research 02's edge cases: dragging a page (and its subpages) under another, adding a page in place, what happens to links and menus pointing at a moved page, the home page, and Undo.

## Resolution (2026-10-26)

Lex, after trying the [site map prototype](../prototypes/08-site-map.html) (also at `am-typing-together-poc.lexvd.workers.dev/mockups/site-map.html`) and being asked for his round 1 answers: "looks good". Taken as yes to the prototype and to every round 1 recommendation (Q1–Q11).

- **Drag a page onto another** to move it underneath, with its subpages. This reuses the Pages tab's move (`dropProblem`, `confirmMove`, `src/controllers/pages-controller.ts:301-348`) through Change URL: links and menus are updated, old addresses keep working (`_redirects`, and forwarding pages on GitHub Pages per site-quality slice 31), and Undo in the top bar reverses it.
- **The tile itself shows the result:** "Now /about/team/ · the old address keeps working".
- **Refusals** shake and give the reason on the tile: "Home stays at the top", "Can't go inside itself", "A page named … is already there". The drag check uses the full `planPageMove`.
- **Order:** alphabetical within a level. The header menu's order is set in the menu.
- **Add a page here:** a + on hover adds "Untitled" underneath, named in place, and you stay in the map (`createNew` gets a stay-in-place option).
- **Forwarding pages** (slice 31) are hidden from the site's page list itself, so the map never draws them.
