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
  site downloads (see open point 1).
- **Make component converts only the selected section** (ticket 15): no
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

1. Commit in the starter repo on a branch, not on `main` (open point 1).
2. Check by serving the root (`python3 -m http.server`) and with the editor's
   native-save server on the starter checkout, as in step 7 above.
3. Keep the starter's own rules: no build, no `package.json`, root links.
4. The editor picks a starter commit up in two places: `fixtures/actual-starter`
   (test data, refreshed by re-archiving a named commit, see its README) and
   the vendored preview copy `public/native-static-starter/v<sha>/`
   (slice [63](tickets/63-vendor-starter-for-preview.md)).

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
  free ([02](../tickets/02-masters-become-components.md) §2), as a second slice.
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
  fallback ([04](../tickets/04-prototype-making-components.md) §7).
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
  `AGENTS.md`.

### Phase 3: Make component and New component

- **Making mode in the preview** ([04](../tickets/04-prototype-making-components.md) §1–4, §6,
  amended by 14's chip rename): purple frame, slots outlined with name chips,
  edit bar hidden, chips toggle on click and rename on double-click with a
  caret in the chip (never an input field), "+ slot" on hover, context menu,
  Structure border; a slim bar with name, tag, Cancel and Create; names made
  valid as typed. Entry points: edit bar, Structure row ⋯ menu, right-click.
- **Create** writes the files and turns the section into an instance in one
  undo step, then opens Edit component (the code pane until phase 5 lands,
  then the visual mode; slice [49](tickets/49-create-lands-in-edit-mode.md)).
- **+ New component** at the top of the Add panel's component list
  ([04](../tickets/04-prototype-making-components.md) §11–12).

### Phase 4: Block builder

- **Icon rail** before Page Structure; names on hover or focus; Add keeps
  components and sections ([12](../tickets/12-prototype-drag-and-drop.md) §1).
- **Click-insert by selection** and keep building; flash label; refusals
  with the reason ([12](../tickets/12-prototype-drag-and-drop.md) §2–4).
- **Blocks:** heading level from position, never `h1` by default
  ([10](../tickets/10-block-set.md) §2); placeholders for Image and Button
  ([12](../tickets/12-prototype-drag-and-drop.md) §3); Div Layout select
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
  into an instance only through its items slots, bypassing the instance seal
  (`native-operations.ts`) only there; named slots refuse with the reason
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
  struck fixed; click toggles, double-click renames in place.
- **Slot changes reach every page** in the same undo step (§8–9).
- **Outside the mode** fixed parts are locked, with an Edit component hint;
  Page Structure lists only the instance's slots (§7).

### Phase 6: Add card

- **Card first:** Add card places a fresh instance of the items slot's card
  component, working from 0 items ([04](../tickets/04-prototype-making-components.md) §8,
  [09](../tickets/09-prototype-add-existing-page.md) §1).
- **"Link to a page…" combobox:** all pages but the grid's own and 404, the
  cards' folder first, "In this grid" greyed, Create page for an unknown
  address or title, one undo step ([09](../tickets/09-prototype-add-existing-page.md) §2–3).
- **Fill mapping**, matching slots, info strip, stretched link on non-link
  grids ([09](../tickets/09-prototype-add-existing-page.md) §4–6).
- **Card look:** split Add card ▾ gallery and a look chip on the card; card
  components then variants; content kept by slot role across looks, with
  what doesn't fit kept aside ([09](../tickets/09-prototype-add-existing-page.md) §7–10).
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
  instances, stretched links, card component), name normalising, variant
  parser (component and site CSS, warnings), heading level, click-insert
  target, drop target, Section snapping, Alt+←/→ moves, items-slot detection,
  slot change rewrite plan, page groups, card fill mapping, card looks, look
  swap, tone formula sweep, `AGENTS.md` drift.
- **One `@smoke` browser spec per feature's main path** (tag
  `{ tag: "@smoke" }`, default fixture group unless stated): variants in the
  edit bar (slice 13); `make_component` over MCP (19); making mode Create
  (22, which also covers Make component on the edit bar); New component (27);
  click-insert (30); drag a block into a nested container (35); Edit
  component mode, fixed text (42); Add card with a page (53); Tone on a
  section (61). Nine new smoke tests on top of today's ~30.
- **Edge cases are nightly** (untagged tests, run in 4 shards by
  `.github/workflows/browser-tests.yml`).
- Removed features take their specs and Playwright projects with them; the
  smoke slice and the full native-save suite stay green after phase 1.
- Full suite (`scripts/agents/full-suite.sh 3`) before merging a slice that
  touches shared plumbing (the preview runtime, source edits, transactions).

## Open points for Lex

Missing or contradictory decisions found while writing the plan. The slices
they touch say so; the lead settles each with Lex before that slice starts.

1. **Starter commits and production.** Production's Start your site
   downloads the starter template's `main` (`STARTER_SOURCE` unset,
   `worker/starter.ts`), so pushing starter commits to `main` ships them to
   production. Preview uses the vendored copy `v6a9ca44`, which predates the
   starter's components. Which starter branch do these commits go on, and
   when do they reach `main`? (Slices 05, 06, 15, 17, 58, 60, 63.)
2. **Page CSS on Make component.** Ticket 01 §6 measured that a shared rule
   like `.intro h2` stops reaching slotted content once the section becomes a
   component, and research 06 edge case 14 notes the same for `data-*` styled
   by page CSS. No ticket decides whether Make component moves or copies
   those rules into `<tag>.css`, warns, or leaves the look to change.
   (Slices 07, 22.)
3. **Stretched-link markup.** Ticket 03 §2 makes the heading `<a slot="link">`
   with `a::after { inset: 0 }` in the template CSS; ticket 09 §4 fills a
   separate link slot ("Read about <title>"); ticket 09 §6 adds
   `<a href class="stretched">` to non-link grids, a class outside the
   conventions' vocabulary (`flow`, `cards`, `btn`) with no decided home for
   its CSS. One markup and one CSS home are needed. (Slices 09, 55.)
4. **The page's own items after Make component.** Ticket 04 §7 makes the
   repeated item a card component and the template's fallback one instance;
   ticket 03 §5 says the items stay plain HTML (or instances) on the page.
   Are this page's items converted to instances of the new card component
   (each keeping its text in slots), or left as plain HTML? (Slice 10.)
5. **What counts as an items slot.** Ticket 12 includes "a slot whose
   fallback holds a component"; ticket 03 §6 makes every nested instance a
   whole slot. Is a single nested instance slot (one `<card-x>`) an items
   slot that takes drops and Add card? (Slices 40, 50.)
6. **When page rewrites happen in Edit component mode.** Ticket 14 §6 makes
   each change one undo step as it happens; §8 gives every page its copy of a
   newly slotted part "on Done, in the same undo step". At the toggle, or
   at Done? And when a slot becomes fixed or is removed, are the pages'
   filled elements for it deleted from every page, or left in place (unshown)?
   (Slice 45.)
7. **Placeholder image.** Ticket 12 §3 inserts "a placeholder image (`alt=""`,
   width and height)" with no decided `src`: a file written into the site
   (the prototype used `images/placeholder.svg`), a `data:` URI, or
   something else. (Slice 04.)
8. **Chips in making mode versus Edit component mode.** Making mode keeps
   chips on the canvas and "+ slot" on hover (04 §2–3); Edit component mode
   dropped both for the chip in the edit bar label (14 §4), and the edit bar
   is hidden in making mode. Should making mode move to the label chip too,
   for one way of marking slots? The plan builds 04 as written and shares the
   chip control. (Slices 23, 44.)
9. **Tag from a name without a hyphen.** Names are "made valid as typed"
   (04 §4) but a custom element name needs a hyphen: does "services" become
   `section-services`, or is the hyphen required? (Slices 21, 27.)
10. **Make component on non-section elements.** 04 §1 starts from "an
    element"; the making-mode label and ticket 15 speak of the selected
    section. Is Make component offered only on sections? (Slices 02, 22.)
11. **Touch.** Research 11 gap 14: drag has only been tried with a mouse,
    and the Add list uses `touch-action: pan-y`. No ticket covers touch for
    the rail or canvas drags. (Slices 28, 35.)
12. **Content kept aside on a look swap.** 09 §10 keeps what the new look
    can't show and brings it back on a later swap. Nothing editor-only may go
    into the site's code (07 §4), so it lives in the editor: for the editing
    session only, or across reloads with the drafts? (Slice 57.)

## Out of scope

- Replacing copies on other pages on Make component (ticket 15).
- techies-reviews: `data-tone` for its sections, its `AGENTS.md`, the skip
  link, variant conventions. Its own effort later.
- A style panel or free per-element CSS editing.
- A brand-colour control.
- A Span block.

## Done when

- Every slice in [tickets/](tickets/) is closed and merged into `dev`, and
  the preview editor runs the last merge.
- `npm run check`, `npm test`, the smoke slice and the full native-save
  suite are green on `dev`'s head.
- On the real starter, in the preview editor: a built section becomes a
  component through making mode and opens in Edit component mode; a component
  is edited in place and every page follows in one undo step; a page is
  built from blocks by clicking and dragging, nested; Add card links an
  existing page; a section's tone changes and stays readable.
- The conventions, the tool descriptions and the starter's `AGENTS.md` say
  the same thing (the drift test passes), and `make_component` and
  `get_site`'s variants work over MCP.
- Nothing has gone to `main`, production or the starter's `main` without
  Lex's word.
