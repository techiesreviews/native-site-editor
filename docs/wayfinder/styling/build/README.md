# Build: styling

Lex's sixth build (order of 2026-10-23): styling without writing CSS.

- **Style panel:** a panel on the right, in the unblockwp layout, that opens from the brush in the edit bar. It has one Bricks-style selector field for classes, looks and states, free fields with one list of the right variables, and real CSS written into the site's own files. The bottom code editor follows along.
- **A flawless Components section:** the eleven faults research 02 found, fixed.

Every decision comes from the [map](../map.md)'s closed tickets; this build does not reopen them.

Research is on branches that are never merged (`git show origin/<branch>:<path>`):

- `research/st-01-panel-patterns` (nine panels compared, and the CSS they write);
- `research/st-02-components-and-old-panel` (the Components faults with causes and fixes, why the old panel went, what to reuse, where styles go);
- `research/st-03-bricks-acss-wp` (Bricks' selector and global classes, Core Framework and ACSS variables, WordPress block styles).

[Research 09](../research/09-answers-from-the-code.md) is on dev. The prototype is [03-styling-panel.html](../prototypes/03-styling-panel.html), version 3 (Lex's three rounds are in [ticket 03](../tickets/03-prototype-styling-panel.md#resolution-2026-10-26)).

Tickets live in [tickets/](tickets/), one slice each, numbered by stage:

- 10s: stage 1, the writer and what it reads;
- 20s: stage 2, the Components fixes;
- 30s: stage 3, the style panel;
- 40s: stage 4, agents and site quality;
- 49: close-out.

Find takeable slices with `node scripts/agents/tickets.mjs frontier styling`.

## Gate

**Nothing here starts before the [site structure build](../../site-structure/build/README.md)'s last release** (Lex's order: agents and multiplayer, catalogue, detail pass, site quality, site structure, then this). The exception (Lex, 2026-10-26) is stages 1 and 2, which start right after the catalogue release, beside the detail pass.

This build also leans on other maps' slices. `blocked_by` can't point to another map, so each slice names them in its text and the lead checks them before claiming:

- the catalogue's parts and organisms:
  - [slice 07](../../atomic-catalogue/build/tickets/07-toasts-off.md), no toasts (21);
  - [slice 50](../../atomic-catalogue/build/tickets/50-organism-edit-bar.md), the edit bar (14, 30);
  - [slice 64](../../atomic-catalogue/build/tickets/64-organism-components.md), Component panel, Edit component mode and canvas bar (20–25);
  - [slice 66](../../atomic-catalogue/build/tickets/66-organism-top-bar.md), top bar B and its right side (30);
- the agents and multiplayer build (map 1): the MCP tool shape (40);
- site-quality slices 10 and 11 (`kit lighthouse`, `kit site-rules`) and stage 6's rings (41);
- site-structure slice 11, the shared search rule (31 uses it once it has landed).

## Two releases

1. **Components fixes** (stages 1 and 2, without the panel): slices 12, 13, 20–25, plus 10 and 14. Slice 10 changes nothing visible, but it rides here so 14 and stage 3 can start right after.
2. **The style panel** (stages 3 and 4, plus 11): slices 11, 30–36, 40 and 41.

Then 49. Each release follows the kitchen's stations 6–12 ([kitchen.md](../../../agents/kitchen.md)), with Lex's end check before it.

## Rules for the whole build

- **Agent Kit is required** for every slice and every model: `scripts/agents/kit` ([agent-scripts.md](../../../agents/agent-scripts.md#kit), [runner.md](../../../agents/runner.md)).
  - Run `kit doctor` first, then `kit slice` under `kit bg`, and `kit wait job`.
  - While building: `kit unit --affected`, `kit specs --affected` and `npm run check`.
  - `kit size` on every slice: boot bytes must not grow (the 355 KB goal of [tech-debt 12](../../../work/tech-debt/issues/12-boot-back-under-355-kb.md)). The old panel was removed for boot size, so the panel, the writer, the colour picker and the selector table load lazily. Each visible slice quotes the panel chunk's size in Done.
  - `kit shots` for anything visible, light and dark, 390 and 1280 wide.
  - `kit lighthouse` and `kit site-rules` on slices that write site CSS, once site-quality slices 10 and 11 have landed.
  - `kit review`, then `kit pr` into `dev`.
  - A builder that cannot run a kit command says so in `decide`, and never skips one silently.
- **Builders and reviewers** follow the pins in [kitchen.md](../../../agents/kitchen.md#who-cooks-pins-from-2026-10-22):
  - Claude Opus 5.5 builds (`--builder claude-opus-5-5`, high).
  - A fresh Claude Opus 5.5 session reviews (medium).
  - One second opinion on the final version for slices 10, 11, 30 and 32 (`grok-4.7` or `gpt-6.1-sol`, within the weekly budget).
- **Catalogue parts only:** every control is a catalogue part. The panel is an organism, drafted on the board and approved by Lex there. good-css for all CSS. No toasts, no explainer text, no counts in badges ([UX rulebook](../../../agents/ux-rulebook.md)); refusals and invalid values show on the field itself.
- **One writer:** every style change goes through `src/page-builder/css-write.ts`, from the panel, the code editor's swatch picker, Text size and the MCP tool alike. It writes only the declarations it touches and never converts existing CSS (Lex: "use what exists").
- **Real files, ordinary drafts:** changes are drafts in the site's own stylesheets. Each is one Undo step and shows in Compare changes. Never inline styles.
- **The canvas bar stays as built:** Desktop, Tablet 768, Mobile 390, the typed width and dragging (Lex, 2026-10-26). Its specs pass untouched.
- **`src/main.ts`:** wiring only, `tests/main-ts-ceiling.test.ts` green, at most two slices editing it at once (slices marked *main.ts*).
- **Docs move with the code:**
  - `docs/agents/code-map.md` (`tests/code-map.test.ts`) and `docs/agents/features.md` for visible features;
  - `docs/mcp.md` and `worker/site-conventions.ts` for agents;
  - `CONTEXT.md` (slice 49).
- **Runner extras:** owner `ASE_OWNER=st-NN`; branch `build/st-NN-<slug>` from `origin/dev`. No preview deploys by builders (the lead runs `kit preview`). Never `main`.

## Stage 1: the writer and what it reads

| Slice | Size | Visible | main.ts | Blocked by |
| --- | --- | --- | --- | --- |
| [10 The CSS writer comes back](tickets/10-css-writer-back.md) | M–L | – | – | – |
| [11 The writer learns looks, site classes and design values](tickets/11-writer-looks-classes-tokens.md) | M–L | – | – | 10 |
| [12 Token colours read from the preview](tickets/12-token-colours-from-preview.md) | M | – | – | – |
| [13 Every rule knows whether it is site-wide, the component's or a look's](tickets/13-rule-scope.md) | M | – | – | – |
| [14 Text size stops writing inline styles](tickets/14-text-size-no-inline.md) | S | – | – | 10 (and catalogue slice 50) |

## Stage 2: the Components fixes

| Slice | Size | Visible | main.ts | Blocked by |
| --- | --- | --- | --- | --- |
| [20 The component's own rules first, site rules folded](tickets/20-selector-list-own-first.md) | M–L | visible | – | 13 (and catalogue slice 64) |
| [21 Make component copies only what fits, without toasts](tickets/21-make-component-clean.md) | M | visible | – | – (catalogue slices 07 and 64) |
| [22 `var(--` suggests the project's values, with swatches](tickets/22-var-suggestions.md) | M | visible | – | 12, 13 (and catalogue slice 64) |
| [23 Swatches in the code, and a picker on click](tickets/23-code-swatch-picker.md) | M | visible | – | 12 (and catalogue slice 64) |
| [24 Holding Ctrl no longer swaps the stylesheet pane](tickets/24-ctrl-link-no-swap.md) | S | visible | – | – |
| [25 See another look while editing a component](tickets/25-look-switch-in-edit-mode.md) | S–M | visible | – | – (catalogue slice 64) |

## Stage 3: the style panel

| Slice | Size | Visible | main.ts | Blocked by |
| --- | --- | --- | --- | --- |
| [30 The style panel: opens from the brush, lazily](tickets/30-style-panel-shell.md) | L | visible | main.ts | 10 (and the catalogue release, slice 66) |
| [31 Fields: free values with one list of the right variables](tickets/31-fields-and-values.md) | M–L | visible | – | 30, 12, 13 |
| [32 One selector field: classes, looks, states and modern selectors](tickets/32-selector-chips.md) | L | visible | – | 30, 11, 13 |
| [33 The Site styles chip: every site-wide rule, findable](tickets/33-site-styles-chip.md) | S–M | visible | – | 32 |
| [34 Screen sizes follow the canvas bar, which stays as it is](tickets/34-sizes-follow-canvas.md) | S | visible | – | 30 |
| [35 Preview a state while styling it](tickets/35-show-state-preview.md) | S–M | visible | – | 32 |
| [36 Looks as buttons, with New look](tickets/36-looks-row.md) | M–L | visible | – | 32, 11 |

## Stage 4: agents and site quality

| Slice | Size | Visible | main.ts | Blocked by |
| --- | --- | --- | --- | --- |
| [40 Agents style through the same writer](tickets/40-mcp-style-tool.md) | M | – | – | 11 (and map 1 released) |
| [41 What the panel writes keeps good-css and the Lighthouse targets](tickets/41-output-stays-good.md) | M | visible | – | 31, 32 (and site-quality 10, 11) |

## Close-out

| Slice | Size | Visible | main.ts | Blocked by |
| --- | --- | --- | --- | --- |
| [49 Close-out: docs and the end check](tickets/49-close-out.md) | S | – | – | 14, 20–25, 33–36, 40, 41 |

## First wave

10, 12, 13 and 24 together: the writer, the colour probe, the scope reader and the Ctrl fix share no files. 21 and 25 may join them once catalogue slice 64 is released.

## Suggested order

The frontier decides; this is one order that keeps to the rules.

1. 10, 12, 13 and 24; then 14, 20, 21, 22, 23 and 25 (20 and 22 both touch the chip and suggestion code, so one after the other). Lex's end check and the Components release.
2. 11 and 30 together; then 31, 32 and 34; then 33, 35 and 36; then 40 and 41. Lex's end check and the panel release.
3. 49.

## Lead decisions (technical, made in planning)

- **Restore, don't rewrite (10):** the old writer from `1aada9c8c^` with its 40 tests is the base. Its class-chip targeting is not restored (research 02). The old `style-fields.ts` box-model drag is a UX reference only.
- **Writer location (10, 40):** `src/page-builder/css-write.ts`, pure text in and out. The MCP tool runs it in the open tab, as edits do today, so there is no Worker copy.
- **Hover and focus (10, 35):** two rules written together: the guarded `:hover` inside `@media (hover: hover) and (pointer: fine)`, and `:focus-visible` outside it. The same declarations go to both until the person splits them.
- **Sizes (10, 34):** exact-match reuse of `@media (max-width: 768px)` and `(max-width: 390px)`, as the old panel did. The starter's own 720 px blocks are left as they are, and the panel never writes into them (Lex: canvas sizes as built, no conversion).
- **Colours (12, 23):** resolved in the preview, because only it can work out `light-dark()`, `var()` chains and `oklch(from …)`. The picker writes `oklch()`, or keeps `var()`.
- **Scope (13):** Site-wide is a file decision (what every page loads, plus the token files), not a selector guess.
- **Modern selectors (32):** a data table filtered by element and component. Every entry is in Baseline or in all three engines' current release (`::details-content` since Firefox 143). Nothing is marked as experimental in the UI.
- **Looks (36):** names for buttons and text, pictures for cards and sections, with no switch (ticket 03, round 3).
- **Phone (30):** the panel opens as a bottom sheet with the same controls in one column. The prototypes were desktop only, so `kit shots` at 390 shows Lex at the end check (question 3).

## Questions for Lex (asked at hand-off)

Lex answered all three on 2026-10-26: as recommended.

1. **Start the Components fixes earlier?** They fix your list from 2026-10-15 and need only the catalogue's rebuilt Components screens (slice 64). Recommendation: let stages 1 and 2 start right after the catalogue release, beside the detail pass. The panel waits its turn.
2. **The rem / px / em setting: per person or per site?** Recommendation: per person, kept in your browser like the canvas width. rem is the right default for every site, and the unit is only a typing shortcut: what gets saved is written out in full either way.
3. **The panel on a phone:** a sheet from the bottom with the same controls, or laptop only at first? Recommendation: the sheet, so editing works everywhere, as with the other panels.
