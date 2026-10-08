---
title: Decide what agents are told about making components
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: [03-default-editables, 07-variant-contract]
---

## Question

Agents must make components the same way the editor does. Today the rules are spread across `worker/site-conventions.ts` (the `native-site://conventions` resource, :41-68), MCP tool descriptions (`worker/mcp.ts` `write_file` :477, `add_section` :697), each site's `AGENTS.md`/`CLAUDE.md`, and `src/agent-prompts.ts`, and they already disagree on slot placement. Which one is the source of truth, and how are the others kept in step with it (generated, linked, or checked by a test)? What must the guide cover: file layout, whole-element slots, the default editables rule, variants, Add card grids? Do agents also need a tool that makes a component, or does `write_file` plus the guide suffice?

## Resolution (2026-10-08)

Decided with Lex.

1. **One source of truth: the editor's conventions** (`worker/site-conventions.ts`, the `native-site://conventions` resource). The MCP tool descriptions (`write_file`, `add_section`, `get_site`) and the server instructions summary only point to it and state no rules of their own. Today they repeat and contradict it.
2. **Agents get it two ways: `AGENTS.md` and MCP.** Sites made with the editor's Starter site now ship an `AGENTS.md`, whose Components chapter is a copy of the conventions' chapter. It serves any agent working in the repo, with or without the editor, so there is nothing editor-only to clean up. This reverses today's deliberate exclusion (`tests/native-starter.test.ts:63`). A **drift test** fails when the starter's `AGENTS.md` Components chapter (the vendored copy in `fixtures/actual-starter`) differs from the conventions. It replaces the weak pattern check in `tests/mcp-runtime.test.ts:100-108`.
3. **A site's own `AGENTS.md` may add rules for its own style** (for example techies-reviews' `name_component` root class). Where it contradicts how components work (slots, the loader, variants, tones), the conventions win. Fixing techies-reviews' outdated `AGENTS.md` (`data-if`, registration) belongs to the map's "Starter updates" fog.
4. **The Components chapter covers:**
   - the file layout (a template plus optional CSS, nothing registered; the `:69` contradiction goes);
   - whole-element slots;
   - the default editables rule from ticket 03 (what becomes a slot and how it is named, stretched-link cards, nested instances);
   - repeated groups as the unnamed slot, so Add card works;
   - variants as in ticket 07, with the suggested `data-layout`/`data-tone` and the `:host([data-x])` form, nesting included;
   - tones on page bands only, from ticket 08;
   - the header and footer from ticket 02 (nav in the template, skip link in the page).

   It also states accurately what `add_section` copies (`src/native-insert.ts:26-60`), which the text gets wrong today.
5. **Tools.**
   - **New `make_component`**: it takes a page, an element, a tag name and an optional list of slots to keep fixed (the dialog's untick). It runs the editor's own Make component logic (`makeComponentPlan`, with ticket 03's rule) in the editor tab, like `add_section` does. It writes the component files and replaces that element on that page only, leaving other pages alone.
   - **`get_site`** lists each component's variants, using ticket 07's detection in the Worker.
   - **No `set_variant`**: a variant is one attribute, which `edit_file` already handles.
   - Writing a component from nothing stays `write_file` plus the guide.
