# Components, variants and a block builder: build spec

Handoff for the [components-and-builder map](../map.md) (ticket 13). The
decisions live in the [tickets](../tickets/); this spec summarises them as
requirements and points to the deciding rule. The build slices are in
[tickets/](tickets/), indexed in [README.md](README.md).

## Goal

Build the five features the map decided, on `dev` and the preview editor only:

1. **Make component** from built HTML, and **New component** made directly,
   both landing in a visual Edit component mode.
2. **Default slots** (whole-element slots, named by role) and **variants**
   read from CSS, picked in the edit bar and suggested in the code pane.
3. A **block builder**: six blocks in an icon rail, click-insert and nested
   drag and drop on the canvas and in Structure.
4. **Add card** with an existing page, and a choice of card look.
5. **Tones** on page bands that keep text AA whatever the brand colour.

Agents are told the same rules through one source (the conventions), and the
starter shows them.

## Sources

- Deciding tickets: [01](../tickets/01-research-masters-and-components.md)
  to [14](../tickets/14-prototype-edit-component-visually.md). Ticket
  [15](../tickets/15-dedup-on-make-component.md) is out of scope. Read the
  amendments appended to 03, 04, 10 and 14: they override the rule above them.
  Lex changed the design after handoff (2026-10-09): Make component creates
  at once, with no making mode, and lands in Edit component mode (decision 8;
  slices 22, 25, 76).
- Research (branch, file under `docs/wayfinder/components-and-builder/research/`):
  `research/cb-01-masters-and-components` (`01-masters-and-components.md`),
  `research/cb-06-variant-discovery` (`06-variant-discovery.md`, 16 edge cases),
  `research/cb-11-insert-drag-today` (`11-insert-drag-today.md`, 15 gaps).
- Prototypes (throwaway; ideas only, no code is kept), all under `src/prototype/`:
  `prototype/cb-04-make-component` (`cb04-*`),
  `prototype/cb-09-add-existing-page` (`cb09-*`),
  `prototype/cb-12-drag-and-drop` (`cb12-*`),
  `prototype/cb-14-edit-component` (`cb14-*`).
  Read them with `git show <branch>:src/prototype/<file>`.

## Ground rules (Lex, 2026-10-09)

- **One run, tiny slices.** Each slice is one branch, about half a day or
  less. Work continues without waiting for Lex; his feedback, whenever it
  comes, becomes new slices.
- **Nothing goes to `main` or production** (`deploy:techies`) until Lex says.
  That includes the starter's `main` branch, which production's Start your
  site downloads: starter work goes to the starter's `dev` branch and merges
  to its `main` only when Lex says ship, together with the editor.
- **Make component converts only the selected element** (ticket 15): no
  "Also on N other pages" offer, no copies flag on `make_component`.
- **No test-guide file.** Lex gets step-by-step test instructions in chat
  when he asks.

## Flow per slice

Editor slices:

1. Claim the ticket (fill in `assignee:`).
2. `scripts/agents/worktree.sh build/cb-NN-<slug>` from `dev`; work only in
   that worktree.
3. Build. Sol builders run `codex exec -s workspace-write` and cannot commit;
   the lead commits their work.
4. `npm run check`, `npm test`, the touched browser specs (through
   `scripts/agents/port.sh`, see [local testing](../../../agents/local-testing.md)),
   and `npm run test:browser:smoke` once the slice touches shared plumbing.
   Report the byte-budget delta (`npm run test:budget`) for anything loaded at
   boot (the rail, edit bar, Structure); new modes and popovers load lazily.
5. Sol review: `scripts/agents/review.sh <worktree> <brief> <out-dir>`
   (gpt-6.1-sol, read-only, against [CODING_STANDARDS.md](../../../../CODING_STANDARDS.md)
   and the slice's ticket). Fix findings or record why not.
6. Merge into `dev`, push `origin dev`, `npm run deploy:preview` from the dev
   worktree, confirm the live build names the new `index-*.js`.
7. Screenshots of the change on the real starter (the native-save server with
   `ASE_NATIVE_SAVE_FIXTURE=~/Projects/native-site-editor-starter`), shown in chat.
8. Close the ticket: `status: closed` and a short `## Resolution (YYYY-MM-DD)`
   with the merge commit, the preview version and anything left open.

Starter slices (`~/Projects/native-site-editor-starter`, a separate project;
`fixtures/native-starter` in the editor is frozen and never changed):

1. Commit on the starter repo's `dev` branch (create it from `main` the
   first time) and push that branch. Never commit to or merge into `main`
   until Lex says ship.
2. Check by serving the root (`python3 -m http.server`) and with the editor's
   native-save server on the starter checkout (on `dev`), as in step 7 above;
   preview screenshots and tests run against the starter's `dev`.
3. Keep the starter's own rules: no build, no `package.json`, root links.
4. The editor picks a starter commit up in two places: `fixtures/actual-starter`
   (test data, refreshed by re-archiving a named commit, see its README) and
   the vendored preview copy `public/native-static-starter/v<sha>/`, taken
   from the starter's `dev` (slice [63](tickets/63-vendor-starter-for-preview.md)).

## Builders

Sol (codex) takes mechanical slices; Claude agents take judgment-heavy ones,
marked ★ (`builder: claude ★`). Every slice gets the Sol review above.

## Requirements by phase

### Phase 1: Removals

- **Masters and Save shared go, as pure deletion first** ([02](../tickets/02-masters-become-components.md) §2;
  inventory in [01](../tickets/01-research-masters-and-components.md) and its
  research §2a–2c): the modules, `.editor/page-builder.json`, sidecar
  re-keying, `static-section-defaults.ts`, about 139 unit and 71 browser tests
  and three Playwright projects, in one slice.
- **Make component returns to the edit bar** in the place the masters' actions
  free ([02](../tickets/02-masters-become-components.md) §2), as a second slice,
  on containers only: `section`, `div`, `article`, `aside`, `figure`, `nav`, or a
  `header`/`footer` inside article, aside, main, nav or section. Document
  elements, head content, the page's own header/footer, components and anything
  inside an instance are refused (decision 10 below).
- **Conventions wording** for the header, footer and skip link, and the
  register step dropped ([02](../tickets/02-masters-become-components.md) §3).
- **The element catalogue becomes the six blocks** (Section, Div, Image,
  Heading, Paragraph, Button) with ticket 10's markup and ticket 12's
  placeholders; everything else in it is deleted ([10](../tickets/10-block-set.md) §1–2, §6 and its amendment).
- **Starter:** the skip link moves into each page with shared CSS ([02](../tickets/02-masters-become-components.md) §1);
  the starter gains `.btn` ([10](../tickets/10-block-set.md) §3).

### Phase 2: Component model

- **`makeComponentPlan` follows the default editables rule**
  ([03](../tickets/03-default-editables.md) §1–8): whole-element slots for
  text (rich inline kept), standalone links and images; names by role;
  repeated groups as the items slot, lists as a `list` slot; nested instances
  as whole slots; link-wrapped cards as stretched links; kind from the
  fallback. It takes the slots to keep fixed and slot renames as input.
- **A repeated item becomes its own card component**, the items slot's
  fallback ([04](../tickets/04-prototype-making-components.md) §7), and this
  page's items become instances of it in the same undo step (decision 4).
- **The element's page CSS is copied into the new component**, rewritten so
  it looks the same; page CSS is left alone (decision 2).
- **One variant parser in `shared/`** ([06](../tickets/06-research-variant-discovery.md),
  [07](../tickets/07-variant-contract.md) §1–4): component CSS, site CSS
  naming the tag, `:host()` in site CSS, global attributes, class rules for
  blocks ([10](../tickets/10-block-set.md) §4); yes/no variants; conditions;
  exclusions; warnings for the broken form and for no default look.
- **Variants in the edit bar and the code pane** ([07](../tickets/07-variant-contract.md) §5).
  Structure keeps its raw attribute list; no thumbnails.
- **One source for agents** ([05](../tickets/05-what-agents-are-told.md)):
  the conventions' Components chapter (§4) covers everything decided, tones
  included; tool descriptions only point to it; the starter's `AGENTS.md`
  carries a drift-tested copy; new `make_component` tool; `get_site` lists
  variants; no `set_variant`.
- **Starter:** variants on its components with the suggested names
  ([07](../tickets/07-variant-contract.md) §6); the Components chapter in
  `AGENTS.md`; the card link rule that stretches a title link over its card
  (decision 3, slice 65), since component CSS can't reach a link inside
  slotted content.

### Phase 3: Make component and New component

- **Make component creates at once** (Lex, 2026-10-09; decision 8, amending
  [04](../tickets/04-prototype-making-components.md) §2–4, §6): no dialog, no
  making mode, no slim bar. It applies the default slot rule
  (`makeComponentPlan`), makes the card component for repeated items, copies
  the page CSS, and names the component from its first heading ("Recent
  work" → `section-recent-work`, normalised with the `section-`/`card-`/
  `block-` prefix; else `section-1`, `section-2`…, avoiding taken names), all
  as one undo step. Entry points: edit bar, Structure row ⋯ menu, right-click
  (slice [26](tickets/26-make-component-entry-points.md)).
- **It then opens Edit component mode** on the new instance (ticket 14's
  design, phase 5; the code pane while the mode can't frame it, slice
  [49](tickets/49-create-lands-in-edit-mode.md)). The plan's notes (the card
  link, page rules that can't follow) show as a dismissible note in the
  mode's bar, not in a dialog. Slots are then changed there with the slot
  chip (slices 23–24, 44–46, 66) and the component renamed there (slice
  [76](tickets/76-rename-component-in-edit-mode.md)).
- **+ New component** at the top of the Add panel's component list, with its
  small name form (name made valid as typed, tag preview)
  ([04](../tickets/04-prototype-making-components.md) §11–12).

### Phase 4: Block builder

- **Icon rail** before Page Structure; names on hover or focus; Add keeps
  components and sections ([12](../tickets/12-prototype-drag-and-drop.md) §1).
- **Click-insert by selection** and keep building; flash label; refusals
  with the reason ([12](../tickets/12-prototype-drag-and-drop.md) §2–4).
- **Blocks:** heading level from position, never `h1` by default
  ([10](../tickets/10-block-set.md) §2); placeholders for Image and Button
  ([12](../tickets/12-prototype-drag-and-drop.md) §3), the image being the
  site file `images/placeholder.svg`, written on first use; Div Layout select
  (Stack `flow`, Grid `cards`); Button Variant and Size from `.btn` rules
  ([10](../tickets/10-block-set.md) §4).
- **Drag on the canvas:** a line and a label, sideways in rows and grids,
  innermost container wins, ~8 px edge escape, Alt or Tab steps up, Shift+Tab
  back, empty containers show a drop area ([12](../tickets/12-prototype-drag-and-drop.md) §5).
- **Structure** mirrors the canvas target, takes depth from the pointer's x,
  springs folded rows open ([12](../tickets/12-prototype-drag-and-drop.md) §6–7).
- **Sections always snap** between page bands ([12](../tickets/12-prototype-drag-and-drop.md) §8).
- **Blocks drag themselves** (7 px), the name chip drags a text block being
  edited, no grip, no Move to…, header and footer don't drag; cards reorder
  the same way ([12](../tickets/12-prototype-drag-and-drop.md) §10, §12).
- **Keys:** Alt+↑/↓ among siblings, Alt+←/→ out of and into containers
  ([12](../tickets/12-prototype-drag-and-drop.md) §11).
- **Where blocks may go** ([10](../tickets/10-block-set.md) §5 and the 04
  amendment): Section only between bands; others inside a Section or Div;
  into an instance only through its items slots (the unnamed slot, or a slot
  whose fallback is a `card-…` component), bypassing the instance seal
  (`native-operations.ts`) only there; other named slots refuse with the reason
  ([12](../tickets/12-prototype-drag-and-drop.md) §9 and "Items slots").

### Phase 5: Edit component mode, in place

- **The mode** ([14](../tickets/14-prototype-edit-component-visually.md) §1–3, §6):
  the instance becomes its template in place, purple frame, page dimmed, slim
  bar (tag, used on N pages, placeholders or this page's content, Done); fixed
  text edited in place; blocks through the rail; Section refused inside a
  template; nested card components drilled into with a breadcrumb; each
  change one undo step on the template; the code pane follows; no flicker
  (no preview reload); the edited part stays in view.
- **The slot chip** after the element name in the edit bar label, the same
  control as the Structure badge (§4–5): purple slot, pink items slot, grey
  struck fixed; click toggles, double-click renames in place, never an input
  field. Structure frames the component's rows in purple and badges its
  parts; right-click offers Make slot, Rename slot and Remove slot.
- **Slot changes reach every page at once**: made a slot, renamed or made
  fixed rewrites the template and every page as one undo step; Done only
  leaves the mode (§8–9, decision 6).
- **Renaming the component** (Lex, 2026-10-09): double-click the tag in the
  mode's bar and edit it in place, normalised as typed; it moves the folder
  and files, renames the tag in the component's CSS and every page's
  instances (the loader needs nothing, there is no registry), as one undo
  step.
- **Make component and + New component land here** (slices 22, 27, 49).
- **Outside the mode** fixed parts are locked: a click selects the instance
  with its normal edit bar (no hint, Lex 2026-10-09, slice 90); Page
  Structure lists only the instance's slots (§7).

### Phase 6: Add card

- **Card first:** Add card places a fresh instance of the items slot's card
  component, working from 0 items ([04](../tickets/04-prototype-making-components.md) §8,
  [09](../tickets/09-prototype-add-existing-page.md) §1).
- **"Link to a page…" combobox:** all pages but the grid's own and 404, the
  cards' folder first, "In this grid" greyed, Create page for an unknown
  address or title, one undo step ([09](../tickets/09-prototype-add-existing-page.md) §2–3).
- **Fill mapping**, matching slots, info strip
  ([09](../tickets/09-prototype-add-existing-page.md) §4–5). Card links follow
  the card (decision 3): a link slot is filled; a card without one gets its
  title wrapped in a link, stretched over the card by CSS. No `stretched` class.
- **Card look:** split Add card ▾ gallery and a look chip on the card; card
  components then variants; content kept by slot role across looks, with
  what doesn't fit kept aside in the editor while the page is open
  ([09](../tickets/09-prototype-add-existing-page.md) §7–10, decision 12).
- **Starter:** a second card look for the gallery.

### Phase 7: Tone

- **`data-tone` on page bands only** (section components, plain sections,
  header, footer) ([08](../tickets/08-accessible-tone-text.md) §1–2).
- **AA by construction** ([08](../tickets/08-accessible-tone-text.md) §3):
  `light`/`dark` flip `color-scheme`; `brand`/`accent` from `--brand` with
  OKLCH lightness nudged out of 0.50–0.72; `contrast-color()` with a computed
  fallback; buttons invert, links underline; fixed fallbacks without relative
  colour syntax; no editor warning. A unit sweep test proves it.
- **Starter:** four tones from one `--brand`, its hard-coded white on the
  accent removed ([08](../tickets/08-accessible-tone-text.md) §4). Then the
  final starter commit is vendored for preview.

## Test plan

- **Unit tests for every pure rule**, in `tests/*.test.ts` (`npm test`):
  slot plan (whole elements, role names, repeated groups, lists, nested
  instances, stretched links, card component), the page CSS rewrite, name
  normalising and prefixes, variant
  parser (component and site CSS, warnings), heading level, click-insert
  target, drop target, Section snapping, Alt+←/→ moves, items-slot detection,
  slot change rewrite plan, component rename plan, automatic component
  names, page groups, card fill mapping, card looks, look
  swap, tone formula sweep, `AGENTS.md` drift.
- **One `@smoke` browser spec per feature's main path** (tag
  `{ tag: "@smoke" }`, default fixture group unless stated): variants in the
  edit bar (slice 13); `make_component` over MCP (19); Make component
  creating at once and landing in Edit component mode (22, from the edit
  bar); New component (27);
  click-insert (30); drag a block into a nested container (35); Edit
  component mode, fixed text (42); Add card with a page (53); Tone on a
  section (61). Nine new smoke tests on top of today's ~30.
- **Edge cases are nightly** (untagged tests, run in 4 shards by
  `.github/workflows/browser-tests.yml`).
- Removed features take their specs and Playwright projects with them; the
  smoke slice and the full native-save suite stay green after phase 1.
- Full suite (`scripts/agents/full-suite.sh 3`) before merging a slice that
  touches shared plumbing (the preview runtime, source edits, transactions).

## Decided at handoff (Lex, 2026-10-09)

1. **Starter branch:** starter work goes to the starter's `dev` branch; preview tests run against it; it merges to the starter's `main` only when Lex says ship, together with the editor. Slice 63 vendors the starter's `dev` for preview.
2. **Page CSS on Make component:** the rules that styled the selected element are copied into the new `<tag>.css`, rewritten for the component so it looks the same; page CSS is left alone (slice 64).
3. **Card links follow the card:** a card with a link slot gets it filled ("Read about …"); a card without one gets its title wrapped in a link, stretched over the card by the card's CSS (slice 55 fixes the selectors). No `stretched` class.
4. **This page's items after Make component** become instances of the new card component, each keeping its content in its slots, in the same undo step (supersedes ticket 03 §5's "items stay plain HTML").
5. **Items slot:** the unnamed slot, or a slot whose fallback is a card component (a `card-…` tag). A slot holding one other nested instance is an ordinary slot.
6. **Edit component mode:** each slot change (made a slot, renamed, made fixed) rewrites the template and every page at once, one undo step; Done only leaves the mode. A slot made fixed removes each page's element for it (undo restores); the template's text shows instead.
7. **Placeholder image:** the site file `images/placeholder.svg`, written the first time an Image block is inserted (same undo step), then reused.
8. **No making mode; one way to mark slots** (changed by Lex after handoff, 2026-10-09: "When making a component, why is there a modal? I just want it created, the code should know how."): Make component creates at once with the default slot rule, the card component and the copied page CSS, named automatically from its first heading (else `section-1`, `section-2`…), in one undo step, and then opens Edit component mode on the new instance, where the plan's notes show in the bar. Slots are marked there with ticket 14's label chip (after the element name, the same control as the Structure badge): click toggles slot ↔ fixed, double-click edits the name in place; Structure badges; right-click Make slot, Rename slot, Remove slot. No canvas chips, no "+ slot" on hover. The component is renamed by double-clicking its tag in the mode's bar (slice 76). + New component keeps its small name form. Supersedes the making mode of ticket 04 §2–4 and slices 22–25 as first written.
9. **Names without a hyphen** get a prefix from what they were made from: `section-`, `card-`, else `block-`; + New component's form shows the result as typed, and so does renaming in Edit component mode's bar.
10. **Make component works on containers only:** `section`, `div`, `article`, `aside`, `figure`, `nav`, or a `header`/`footer` inside article, aside, main, nav or section. Headings, paragraphs, other text elements, images, links, buttons, lists and forms are refused, as are document elements (including `<main>` and `<body>`), head content, the page's own header/footer, components and anything inside an instance.
11. **Touch drag** is out of scope for this run; click-insert works on touch.
12. **Content kept aside on a look swap** lives in the editor while the page is open (a swap back restores it); it is gone after a reload or page switch; nothing is written to the HTML.

## Out of scope

- Replacing copies on other pages on Make component (ticket 15).
- techies-reviews: `data-tone` for its sections, its `AGENTS.md`, the skip
  link, variant conventions. Its own effort later.
- A style panel or free per-element CSS editing.
- A brand-colour control.
- A Span block.
- Touch drag for the rail, canvas and Structure (click-insert works on touch).

## Done when

- Every slice in [tickets/](tickets/) is closed and merged into `dev`, and
  the preview editor runs the last merge.
- `npm run check`, `npm test`, the smoke slice and the full native-save
  suite are green on `dev`'s head.
- On the real starter, in the preview editor: a built section becomes a
  component with one click of Make component and opens in Edit component
  mode, where it can be renamed; a component
  is edited in place and every page follows in one undo step; a page is
  built from blocks by clicking and dragging, nested; Add card links an
  existing page; a section's tone changes and stays readable.
- The conventions, the tool descriptions and the starter's `AGENTS.md` say
  the same thing (the drift test passes), and `make_component` and
  `get_site`'s variants work over MCP.
- Nothing has gone to `main`, production or the starter's `main` without
  Lex's word.

**Amended (Lex, 2026-10-09):** decision 10 narrowed: Make component only on container elements (section, div, article, aside, figure, nav, a non-page header/footer), not on text, images, links, buttons or lists (slice 80).
