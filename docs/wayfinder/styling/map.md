---
label: wayfinder:map
title: Styling
charted: 2026-10-26
tracker: local markdown (tickets live in tickets/ with a blocked_by line in each)
---

## Destination

A build plan for styling without writing CSS:

- **Visual styling panel:** plain controls (colour, size, spacing, layout) for the site-wide design values and for the selected element or component. A "Code" view shows exactly the CSS it writes.
- **A flawless Components section:** the faults Lex named on 2026-10-15 fixed:
  - the style picker offers only selectors that match the component's own HTML;
  - `var(--` suggestions offer the project's design tokens and the open file's own custom properties;
  - token colours show;
  - colour swatches appear in the suggestion list and inline in the code.

## Notes

- **Planning only.** Sixth and last in Lex's order of 2026-10-23.
- **Charting answers (Lex, 2026-10-26, all as recommended):**
  - the destination above;
  - **what it changes:** both the site-wide design values and the selected element's styles. Element changes are written as clean CSS in the component's own stylesheet, using the design values (good-css), never as inline styles;
  - **where:** a panel on the right that opens from a style icon in the edit bar when something is selected;
  - **who:** Lex (who knows HTML, CSS and JS) and non-technical users alike.
- **History:**
  - **A style panel existed and was removed** by the lean-fast-editor map (charted 2026-10-06: "Remove the style panel", about 1,850 source and 2,100 test lines).
  - The style cascade (`src/style-cascade.ts`, `shared/cascade.ts`, `resolveSelectedRules`) stayed, for the focal point, linked rules and MCP measure.
  - The components-and-builder map decided that blocks are styled by site classes and **component variants set through data attributes**, with no free per-element CSS. Research 02 finds out why the panel went, so the new one doesn't repeat it.
- **Inputs:**
  - **The atomic catalogue** (map 2): the editor's own parts, from which the panel is built.
  - **Top bar B and the left panel** (catalogue slice 66).
  - **Site quality:** good-css for all site CSS, and the Lighthouse targets the panel's output must keep.
  - **The to-do list's components polish item** (Lex, 2026-10-15), which says to test the rest of the Components area end to end before planning.
- **UX rules:** no toasts, feedback in place, no explainer text; `docs/agents/ux-rulebook.md`.
- **Skills:** `grilling` with `domain-modeling`; `research` (branches `research/st-NN-<slug>`); `good-css`; prototypes in `prototypes/`, served from the PoC Worker's `/mockups/` (Lex is remote).
- **To find takeable tickets:** `node scripts/agents/tickets.mjs frontier styling`.

## Decisions so far

<!-- one line per closed ticket: [title](tickets/file.md): gist -->
- [Find how the best visual styling panels work and what they write](tickets/01-research-panel-patterns.md#resolution-2026-10-26): same seven groups everywhere; only DevTools edits real stylesheets; recommend DevTools honesty with Webflow controls, tokens first, clean good-css output
- [Find what the Components section gets wrong and why the old style panel went](tickets/02-research-components-and-old-panel.md#resolution-2026-10-26): root causes for all four faults plus seven more; old panel went for boot size and couldn't style components; reuse cascade and the old CSS writer; styles go in the component's own file, variants as :host([data-…])

## Not yet specified

- **States and sizes:** hover and focus styles, and phone versus desktop (container or media queries) in the panel.
- **Variants:** does the panel edit a component's data-attribute variants, or make new ones?
- **Agents:** can an agent use the same panel actions (MCP), so the CSS written is the same either way?

## Out of scope

- **Site-quality scoring:** map 4. This map only keeps the panel's output within those rules.
