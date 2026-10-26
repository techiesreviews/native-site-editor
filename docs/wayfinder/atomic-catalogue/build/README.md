# Build: atomic design catalogue

Lex's second build after the clean-up (order of 2026-10-23): one approved set of parts that every editor screen is made from, shown on a Paper-like board on the preview editor, with the editor's shared values from the techies.tools Framework, every toast replaced by feedback in place, and a count of one-offs that only goes down. Every decision comes from the [map](../map.md)'s closed tickets; this build does not reopen them.

Research is on branches that are never merged (`git show origin/<branch>:<path>`):

- `research/ac-01-techies-framework`
- `research/ac-02-board-on-a-canvas`
- `research/ac-03-toasts-and-explainers` (every toast and explainer with file and line)
- `research/ac-04-parts-inventory` (every copy of every part, the counting scripts, the organisms)

The approved board prototype is [../prototypes/08-board.html](../prototypes/08-board.html).

Tickets live in [tickets/](tickets/), one slice each, numbered by wave:

- 01–07: wave 0, foundations;
- 10s: wave 1, atoms;
- 20s: wave 2, molecules and the agents map's parts;
- 30s–40s: replacement slices;
- 50s–60s: wave 3, organisms (66, the slim top bar, added 2026-10-26 from the site quality map, runs after 64);
- 65: close-out.

Find takeable slices with `node scripts/agents/tickets.mjs frontier atomic-catalogue`.

## Gate

**Nothing here starts before the [agents and multiplayer build](../../agents-and-multiplayer/build/README.md) is released to production** (Lex's order; ticket 05 of this map kept it). That build's new parts (pins, name chips, carets, agent outline, the MCP menu's agent list) move onto the board in slice 27. The lead checks `kit status` before claiming slice 01.

## Waves, each merged and checked before the next

1. **Wave 0, foundations** (01–07): `light-dark()` first, then the shared values, the one-offs count, the board page, and the toasts.
2. **Wave 1, atoms** (10–14), and **wave 2, molecules and agent parts** (20–27). Each part slice **adds the part to the board only**; it never touches editor screens.
3. **Replacement slices** (30–42), one per part group. Each is gated on Lex pressing **Approve** for that part on the board ([ticket 08](../tickets/08-prototype-board.md#resolution-2026-10-25)); the mark in `src/catalogue/approvals.json` is the go-ahead. A part Lex has not approved never replaces anything. The lead reads the file before claiming (until `kit next` reads it, factory ticket 05).
4. **Wave 3, organisms** (50–64, then 66), rebuilt from parts **one at a time** (each `blocked_by` the one before). Lex approves each organism's frame on the board like a part. Slices 54–64 say "re-plan when reached".
5. **Close-out** (65).

Lex's end check and a release follow wave 0, the replacement slices, and wave 3 (three releases), per the kitchen's stations 10–12.

## Rules for the whole build

- **Agent Kit is required** for every slice and every model: `scripts/agents/kit` ([agent-scripts.md](../../../agents/agent-scripts.md#kit), [runner.md](../../../agents/runner.md)).
  - Run `kit doctor` first, then `kit slice` under `kit bg`.
  - While building: `kit unit --affected`, `kit specs --affected` and `npm run check`.
  - `kit size` on every slice, because boot bytes must not grow.
  - `kit shots` for anything visible.
  - `kit review`, then `kit pr` into `dev`.
  - A builder that cannot run a kit command says so in `decide`, and never skips one silently.
- **Builders and reviewers** follow the pins in [kitchen.md](../../../agents/kitchen.md#who-cooks-pins-from-2026-10-22):
  - Claude Opus 5.5 builds (`--builder claude-opus-5-5`, high).
  - A fresh Claude Opus 5.5 session reviews (medium).
  - One second opinion on the final version for slices 05, 07, 50, 51, 53 and 64 (`grok-4.7` or `gpt-6.1-sol`, within the weekly budget).
- **Visible slices** follow the [UX rulebook](../../../agents/ux-rulebook.md): no toasts and no explainer text.
  - Part slices show their frame on the board in `kit shots`; Lex approves on the board.
  - Replacement and organism slices run `kit shots --compare dev` (light and dark, 390 and 1280 wide). The lead shows Lex the contact sheet, and the Opus UX review reads it.
- **How parts are built:** plain TypeScript functions with options, one class per part, variants as data attributes, slots as arguments ([ticket 11](../tickets/11-grill-extendable-parts.md#resolution-2026-10-25)). Parts use only shared tokens (slices 02 and 03).
- **The one-offs count** (slice 04, [ticket 10](../tickets/10-grill-one-way-check.md#resolution-2026-10-25)) may only go down. Slices 01–03 land before it, and every later slice quotes its `RESULT:` line. A rise needs the lead's written waiver.
- **`src/main.ts`** (about 530 lines of wiring): wiring only, `tests/main-ts-ceiling.test.ts` green, and at most two slices editing it at once (slices marked *main.ts*).
- **Byte budget:** boot stays within `tests/perf/byte-budget.ts`. The board is a separate page built only with `CATALOGUE=1`, so it adds 0 bytes.
- **Docs move with the code:** `docs/agents/code-map.md` (`tests/code-map.test.ts`), `docs/editor-colors.md` for tokens, and `CONTEXT.md` only if a user-facing term appears.
- **Runner extras:** owner `ASE_OWNER=ac-NN`; branch `build/ac-NN-<slug>` from `origin/dev`. No preview deploys by builders (the lead runs `kit preview`). Never `main`.

## Wave 0: foundations

| Slice | Size | Visible | main.ts | Blocked by |
| --- | --- | --- | --- | --- |
| [01 Dark mode written with light-dark()](tickets/01-light-dark-theme.md) | S | visible | – | – |
| [02 Shared values from the editor Framework set](tickets/02-framework-shared-values.md) | M | visible | – | 01 |
| [03 Motion, layer and shadow tokens](tickets/03-motion-layers-shadows.md) | S | visible | – | 02 |
| [04 The one-way count of one-offs](tickets/04-one-offs-count.md) | M | – | – | 03 |
| [05 The catalogue board page](tickets/05-catalogue-board.md) | L | visible | – | 01, 03 |
| [06 Try again and Replace Undo get their own homes](tickets/06-recovery-before-toasts.md) | S–M | visible | – | – |
| [07 No toasts: the one switch and feedback in place](tickets/07-toasts-off.md) | L | visible | main.ts | 06 |

## Wave 1: atoms

| Slice | Size | Visible | main.ts | Blocked by |
| --- | --- | --- | --- | --- |
| [10 Part: Icon](tickets/10-part-icon.md) | S–M | visible | – | 05, 04 |
| [11 Parts: Button, Icon button, Close button](tickets/11-parts-buttons.md) | M | visible | – | 10 |
| [12 Parts: Text field, Select, Tick box, Radio, Switch](tickets/12-parts-fields.md) | M | visible | – | 10 |
| [13 Parts: Badge, Section heading, Keyboard key](tickets/13-parts-badge-heading-key.md) | S–M | visible | – | 05, 04 |
| [14 Parts: Spinner, Progress bar](tickets/14-parts-spinner-progress.md) | S | visible | – | 05, 04 |

## Wave 2: molecules and the agents map's parts

| Slice | Size | Visible | main.ts | Blocked by |
| --- | --- | --- | --- | --- |
| [20 Part: Tooltip](tickets/20-part-tooltip.md) | S–M | visible | – | 11, 13 |
| [21 Parts: Field row, Search field](tickets/21-parts-field-row-search.md) | M | visible | – | 12, 11 |
| [22 Parts: Menu item, Menu](tickets/22-parts-menu.md) | M | visible | – | 11, 13 |
| [23 Part: Dialog](tickets/23-part-dialog.md) | M | visible | – | 11 |
| [24 Part: Tabs and segmented group](tickets/24-part-tabs.md) | S–M | visible | – | 11 |
| [25 Parts: Empty state, Card or tile](tickets/25-parts-empty-card.md) | M | visible | – | 11, 13 |
| [26 Part: In-place notice](tickets/26-part-notice.md) | S | visible | – | 11 |
| [27 Parts: pin, name chip, caret with circle, agent outline](tickets/27-parts-agents.md) | M | visible | – | 13, 11 |

## Replacement slices (each gated on Lex's Approve)

| Slice | Size | Visible | main.ts | Blocked by |
| --- | --- | --- | --- | --- |
| [30 Into the editor: Icon](tickets/30-swap-icon.md) | M | visible | – | 10 |
| [31 Into the editor: Button, Icon button, Close button](tickets/31-swap-buttons.md) | L | visible | – | 11 |
| [32 Into the editor: fields, tick boxes, radios, switches](tickets/32-swap-fields.md) | L | visible | – | 12 |
| [33 Into the editor: Badge, Section heading, Keyboard key](tickets/33-swap-badge-heading-key.md) | M | visible | – | 13 |
| [34 Into the editor: Spinner, Progress bar](tickets/34-swap-spinner-progress.md) | S | visible | – | 14 |
| [35 Into the editor: Tooltip](tickets/35-swap-tooltip.md) | L | visible | – | 20 |
| [36 Into the editor: Field row, Search field](tickets/36-swap-field-row-search.md) | M | visible | – | 21 |
| [37 Into the editor: Menu item, Menu](tickets/37-swap-menu.md) | M | visible | – | 22 |
| [38 Into the editor: Dialog](tickets/38-swap-dialog.md) | M | visible | – | 23 |
| [39 Into the editor: Tabs and segmented group](tickets/39-swap-tabs.md) | M | visible | – | 24 |
| [40 Into the editor: Empty state, Card or tile](tickets/40-swap-empty-card.md) | M | visible | – | 25 |
| [41 Into the editor: In-place notice](tickets/41-swap-notice.md) | M | visible | – | 26 |
| [42 Into the editor: agent parts](tickets/42-swap-agents.md) | M | visible | – | 27 |

## Wave 3: organisms, one at a time

| Slice | Size | Visible | main.ts | Blocked by |
| --- | --- | --- | --- | --- |
| [50 Rebuild from parts: Edit bar](tickets/50-organism-edit-bar.md) | L | visible | main.ts | 31, 32, 33, 35, 37, 38, 41 |
| [51 Rebuild from parts: Page Structure](tickets/51-organism-page-structure.md) | L | visible | main.ts | 50 |
| [52 Rebuild from parts: Pages and Files](tickets/52-organism-pages-files.md) | M | visible | – | 51 |
| [53 Rebuild from parts: Media pane and picker](tickets/53-organism-media.md) | L | visible | main.ts | 52 |
| [54 Rebuild from parts: Image popup, Media popup, large image editor](tickets/54-organism-image-popup.md) | M | visible | – | 53 |
| [55 Rebuild from parts: Project menu](tickets/55-organism-project-menu.md) | M | visible | – | 54 |
| [56 Rebuild from parts: MCP menu](tickets/56-organism-mcp-menu.md) | S | visible | – | 55 |
| [57 Rebuild from parts: Request pins](tickets/57-organism-pins.md) | S | visible | – | 56 |
| [58 Rebuild from parts: Save menu and Compare changes](tickets/58-organism-save-menu.md) | M | visible | – | 57 |
| [59 Rebuild from parts: Command palette and Keyboard shortcuts](tickets/59-organism-palette.md) | S | visible | – | 58 |
| [60 Rebuild from parts: Settings dialog](tickets/60-organism-settings.md) | M | visible | – | 59 |
| [61 Rebuild from parts: Sign in, Get started, Setup wizard and checklist](tickets/61-organism-onboarding.md) | M | visible | – | 60 |
| [62 Rebuild from parts: History](tickets/62-organism-history.md) | S | visible | – | 61 |
| [63 Rebuild from parts: Add panel and empty page](tickets/63-organism-add-panel.md) | M | visible | – | 62 |
| [64 Rebuild from parts: Component panel, Edit component mode, canvas bar](tickets/64-organism-components.md) | L | visible | – | 63 |
| [66 Rebuild from parts: Top bar, slimmer](tickets/66-organism-top-bar.md) | M | visible | – | 64 |

## Close-out

| Slice | Size | Visible | main.ts | Blocked by |
| --- | --- | --- | --- | --- |
| [65 Close-out: kitchen, docs and the final count](tickets/65-close-out.md) | S | – | – | 66, 64, 30, 34, 36, 39, 40, 42 |

## Suggested order

The frontier decides; this is one order that keeps to the rules.

1. 01 beside 06; then 02 and 07; then 03; then 04 and 05. Then Lex's wave-0 end check and release.
2. 10, 13 and 14 together; then 11 and 12; then 20–27 as their parts land. Lex approves parts on the board as they appear.
3. Each replacement slice as soon as its part is approved. Then Lex's end check and release.
4. 50 to 64 in order, then 66 (the slim top bar), then 65. Then Lex's end check and release.

## Lead decisions (technical, made in planning)

- **Saving an approval (05):** the board does not start the editor. Approve writes `src/catalogue/approvals.json` in the editor's own repository through the editor's Save to GitHub path, with Lex's preview-editor sign-in.
  - Slice 05 confirms in `decide` that the GitHub App can write that repository.
  - If it cannot, the builder stops and the lead asks Lex to install the App there.
- **The editor Framework set (02):** produced by running the Framework's own export code from `~/Projects/TechiesTools` in a script, never by hand in a browser. Both the settings and the output are committed, so it can be re-run, and Lex never has to export anything. `~/Projects/TechiesTools` is not changed; motion, layers and shadows stay editor tokens ([ticket 06](../tickets/06-grill-shared-values.md#resolution-2026-10-25)).
- **Toasts (06, 07):** recovery moves first (06), then the one switch (07), exactly as in [ticket 09](../tickets/09-grill-toast-replacements.md#resolution-2026-10-25). Until the In-place notice part lands (26), errors on controls use today's anchored refusal note (`src/components/refusal-note.ts`); slice 41 swaps them.
- **Mock-ups:** once wave 0 lands, future feature mock-ups are made in the board's Mock-ups area (`src/catalogue/mockups.ts`) from approved parts, linked as `catalogue.html?mockup=<name>` ([ticket 07, item 6](../tickets/07-grill-board-look-and-use.md#resolution-2026-10-25)). The matching update to kitchen station 3 is proposed to Lex in slice 65; the lead edits `docs/agents/kitchen.md` only after he agrees.
