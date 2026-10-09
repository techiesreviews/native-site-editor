---
label: wayfinder:map
title: Components, variants and a block builder
charted: 2026-10-08
tracker: local markdown (tickets live in tickets/ with a blocked_by line in each)
---

## Destination

A decided plan, ready to hand off, for five features: making components (from built HTML and directly), default editables, Add card with an existing page, per-component variants set through data attributes, and a drag-and-drop block builder (Section/Div, Image, Button, Heading, Paragraph, Span, Link with the button class). It also covers what agents are told so that they make components the same way. No code changes come from this map. It is done when nothing is left to decide before building starts.

## Notes

- **Planning only.** Tickets produce decisions, not code. Building is handed off once the map is clear. Building happens on `dev` and is deployed with `npm run deploy:preview`, never to production, until Lex says otherwise.
- **Settled while charting (2026-10-08, with Lex):**
  - A component is only `components/<tag>/<tag>.html` plus an optional `<tag>.css`, defined at runtime by the site's `components/components.js`. There is no other registry.
  - The `.editor/sections` masters and **Save shared** are retired. Shared sections, headers and footers become custom-element components. How the existing masters convert is ticket 02.
  - **Make component** (currently hidden in production) is the way from HTML to a component.
  - **Slots wrap the whole element**: `<slot name="title"><h3>…</h3></slot>` in the template, `<h3 slot="title">` on the page. This one rule covers text, links and images. Make component changes to match (today it puts the slot inside the element).
  - **Add card › existing page**: the new card takes the page's title/h1, meta description, og:image and address. The user edits them afterwards.
  - **The block builder produces plain HTML in the page**, using the site's classes. Make component turns a built section into a component later.
  - **Variants are free per component**: a component declares its own `data-*` attributes and values in its CSS, and the editor discovers them. There is no fixed global set.
- **Language:** use the terms in `CONTEXT.md`. *Variant*, *Tone* and *Block* are in `CONTEXT.md`.
- **Reference sites:** `~/Projects/techies-reviews` (real components, OKLCH brand scale, `.btn[data-variant]`, section-cards) and `~/Projects/native-site-editor-starter` (separate project; `fixtures/native-starter` is frozen test data).
- **Grilling tickets** run as a live conversation with Lex (AskUserQuestion). The agent never answers for Lex.
- **Research tickets** are resolved by subagents. Findings go on a `research/cb-<ticket>` branch in `docs/wayfinder/components-and-builder/research/`, and a pointer is added to the ticket.
- **To find takeable tickets:** look in `tickets/` for `status: open`, an empty `assignee:`, and every `blocked_by` ticket closed. Claim a ticket by filling in `assignee:` before doing any work.

## Decisions so far

<!-- one line per closed ticket: [title](tickets/file.md): gist -->

- [Decide the default editables rule](tickets/03-default-editables.md): every text element (rich inline kept), standalone link, img/picture and nested instance becomes a whole-element slot named by role; link-wrapped cards become stretched links; repeated groups (same tag + first class, ≥2) become the unnamed slot, lists a `list` slot; svg stays fixed; no optional marker
- [Inventory the shared masters, page parts and components in use](tickets/01-research-masters-and-components.md): no real masters exist anywhere (the masters code is dev-only), so retiring them means removing about 4k lines plus tests; live templates already wrap whole elements; header and footer show no links without JS; slotting nav links fixes that at the cost of a nav copy on every page
- [Research what insert, drag and move support today](tickets/11-research-insert-drag-today.md): source edits already nest; the UI only drops and drags whole sections between siblings; elements were taken out of Add; instances take no drops; 15 gaps, the largest being nested drop targets and drops into instances
- [Research variant discovery from component CSS](tickets/06-research-variant-discovery.md): `:host([data-x="v"])` rules in the component CSS, including inside at-rules; an absent attribute is the default; labels from the value or an optional `/* variant … */` comment; a shared parser in `shared/`; no loader change
- [Decide how masters and page parts become components](tickets/02-masters-become-components.md): nav links stay in the header/footer templates (one edit, JS allowed); the skip link moves into each page before `<site-header>` with shared CSS; masters code is removed as its own deletion slice before Make component returns to the edit bar; `site-conventions.ts:52` reworded and `:69`'s register step dropped
- [Decide the variant contract](tickets/07-variant-contract.md): a variant is a `data-*` attribute some CSS styles on the host (component CSS, site CSS naming the tag or `:host()`, global attributes like `data-color-scheme`, nested forms included); absent = default; no editor comments in code, labels from values; picked in the edit bar (dropdowns/checkboxes, a Variants button past two) and suggested in the HTML code pane; `data-layout` and `data-tone` suggested, not enforced
- [Decide how tone variants keep text accessible](tickets/08-accessible-tone-text.md): `data-tone` on page bands only (sections, header, footer); text, buttons and links adjust automatically; AA guaranteed by nudging the brand surface's OKLCH lightness out of the mid band plus `contrast-color()` with a computed fallback, proven by a sweep test; no editor warning; the starter ships light/dark/brand/accent from one `--brand`
- [Decide what agents are told about making components](tickets/05-what-agents-are-told.md): the editor's conventions are the one source; tool descriptions only point to it; new sites ship an `AGENTS.md` whose Components chapter is a drift-tested copy; a site's own `AGENTS.md` may add style rules only; new `make_component` tool reusing the editor's logic, `get_site` lists variants, no `set_variant`
- [Decide the block set and its markup](tickets/10-block-set.md): six blocks (Section, Div, Image, Heading, Paragraph, Button as `<a class="btn">`); Section and Div start empty with a drop area; the builder writes only the conventions' classes `flow`, `cards`, `btn`; heading level from position; Button gets the site's `.btn` variants, Section Tone, Div Stack/Grid; drops into instances only into the unnamed slot; the hidden element catalogue becomes the block set and the rest is deleted
- [Prototype the two ways to make a component](tickets/04-prototype-making-components.md): variant E: an in-preview making mode (chips toggle on click, rename on double-click, "+ slot" on hover, edit bar hidden, slim bar with name, Cancel, Create, and a ticked "also on N pages" replace); Create and "+ New component" (Add panel) land in a visual Edit component mode; a repeated item becomes its own card component, the items slot's fallback, so Add card works from zero; items slots may be named and take any block

## Not yet specified

- **Starter updates.** Example components with variants and tone tokens in the separate starter project, and whether techies-reviews adopts the variant convention. Both sites also move the skip link out of the header into each page (ticket 02); techies-reviews moves its sections from `data-color-scheme` to `data-tone`, the starter gains `.btn` (ticket 10) and replaces its hard-coded white-on-accent with the tone rules (ticket 08). techies-reviews' `AGENTS.md` drops `data-if` and the registration step and keeps only its own style rules (ticket 05).
- **Card reorder by drag**, which is a known gap. It may fold into the builder's move interaction.
- **Test plan.** Which browser checks each feature adds, following the `@smoke`/nightly split from the lean-fast-editor map.

## Out of scope

<!-- closed tickets ruled beyond the destination, with a one-line reason -->

- A style panel or free per-element CSS editing. The lean-fast-editor map removed the style panel. Blocks are styled by site classes and component variants.
- A brand-colour control (for example in site settings). Ticket 08 keeps the brand colour in `tokens.css`, and the tone rules keep every band AA whatever it is; a control is its own effort.
- A Span block. A bare `<span>` does nothing visible without a class or a style panel, so ticket 10 dropped it for now.
