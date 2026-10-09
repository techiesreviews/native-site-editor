---
title: Prototype the two ways to make a component
type: prototype (HITL)
status: closed
assignee: Lex + claude (prototype)
blocked_by: [03-default-editables]
---

## Question

How should the two entry points look and behave? (a) **Make component** on a selected section or element, built from HTML: where it lives (edit bar, Structure row, both), the dialog (name, tag preview, the editables that will become slots, with toggles), and what the user sees afterwards. (b) **New component**, made directly: where it starts (Add panel, Files, the ⌘K palette), what it starts from (blank section, a copy of an existing component, a default static section from `static-section-defaults.ts`), and where the user lands afterwards to fill it (an instance on the current page, or the template source). Make a rough clickable prototype on `dev`, behind a flag, to react to.

## Resolution (2026-10-09)

Decided with Lex by reacting live to five variants on `dev` behind `?proto=components` (A dialog, B in the preview, C drawer/canvas, D slot marking, E chips), on the real starter through a tunnel and on preview builds up to `82e4d1b6`. **E is the design.** The prototype code is throwaway and is not kept for the build; it was taken off `dev` and lives only on the branch `prototype/cb-04-make-component` (tip `23de3d9`).

**Make component, from built HTML**

1. **Where it starts:** the edit bar's Make component (ticket 02), the Structure row ⋯ menu, and right-click on an element in the preview or on a Structure row.
2. **Making mode, in the preview:** a purple frame around the section, labelled "Making a component from this `<section>`". Ticket 03's default slots are outlined, each with a name chip. The edit bar is hidden for the whole time. Structure shows one purple border around the section and its rows, readable in light and dark, with slot rows marked.
3. **Chips are the toggle:** a click switches a part between slot and fixed; a double-click renames it, on the chip and in Structure at the same time (the single click waits a moment so a double-click never flips it). Hovering a part that isn't a slot by default offers a faint "+ slot". The context menu has Make slot, Keep fixed and Rename slot. No toggle or slot field in the edit bar.
4. **Slim bar:** the component name, its tag, Cancel and Create. No slot count. Names (component and slot) are made valid as typed: lowercase, spaces become hyphens, anything else invalid is dropped; no warnings.
5. **Copies on other pages:** when identical copies of the section exist on other pages, the slim bar says so ("Also on 3 other pages") with a checkbox, ticked by default. Ticked, Create replaces those copies with instances too, each keeping its own text in its slots, in one undo step. `make_component` (ticket 05) takes the same choice as a flag. What counts as identical is ticket 15.
6. **After Create:** the files are written, the section becomes an instance, and Edit component mode opens on it. Edit component mode edits the template **visually in the preview** (Lex chose this over code-pane-only); how is ticket 14.

**Repeated items** (amends ticket 03 rule 5 and ticket 10's "Where blocks may go")

7. **The card becomes a component.** Make component turns a repeated item into its own component (`card-…`, its name suggested from the items slot, e.g. `services` → `card-service`) unless it is one already. Its slots follow ticket 03. The items slot's fallback in the new template is one instance of it.
8. **Add card adds that component:** a fresh instance with its template's fallbacks, after the last item. It works with 0 or 1 items, because the kind comes from the fallback, not from counting siblings on the page.
9. **Any block may go in an items slot**, not only cards. Add card always adds the slot's card component.
10. **Named items slots count.** Whichever slot holds the repeated items, named (renamed to `services`) or the unnamed one, gets Add card, accepts drops and is renamed like any other slot. A component can have several item lists side by side. Other named slots still refuse drops (ticket 10).

**New component, made directly**

11. **Where it starts:** "+ New component" at the top of the Add panel's component list.
12. **Form:** a name, made valid as typed, and its tag. Create places a blank component (a section with a title slot and an empty items slot) on the current page and opens it in Edit component mode, where it is built with the block set (ticket 14).

**Extended by ticket 09 (2026-10-09):** Add card is a split button; its ▾ and a look chip on the card choose another card component or variant. The plain Add card still adds the slot's card component.

**Amended by ticket 15 (2026-10-09):** rule 5 is dropped. Make component converts only the selected section; there is no "Also on N other pages" offer and no copies flag on `make_component`.
