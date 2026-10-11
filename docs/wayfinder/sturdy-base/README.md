# Sturdy base

A week (from 2026-10-10) of cleanup under the editor, no new features. Order: (0) agent-drift bugs, (1) one guarded edit module, (2) a typed editor↔preview protocol, (3) one Block move module, then (6) one HTML source-tree reader for cards, (4) Edit component mode in one module, (5) one Variant lookup.

Tickets are numbered by candidate: 01-09 for (0), 10-19 for (1), 20s for (2), 30s for (3), 40s for (6), 50s for (5), 60s for (4). Each slice lands on `dev` with `npm run check`, `npm test` and the full `native-save` suite green, and deploys to preview only. ★ = a Claude agent builds it; the rest go to Sol.

## 1. Guarded edit

One module for "check that nothing changed since I read it, then apply one guarded edit as one undo step": a plan reads files through a tracking reader `r`; the module re-proves every read, the repository, branch, page shown, Edit component mode and the page's open editor after every wait, and writes one undo step with the selection. Design: `~/Projects/native-site-editor/.scratch/sturdy/guarded-edit-design.md`.

| Slice | Size | Builder | Blocked by |
| --- | --- | --- | --- |
| [10 Module, memory workspace and its suite (no callers)](tickets/10-guarded-edit-module.md) | L | claude ★ | – |
| [11 Block insert, rail clicks and block drags](tickets/11-guarded-edit-block-insert.md) | M | sol | 10 |
| [12 Cards: add, fill, swap look, create page](tickets/12-guarded-edit-cards.md) | M | sol | 10 |
| [13 Component tools and Edit component mode](tickets/13-guarded-edit-components.md) | L (may split 13a/13b) | claude ★ | 10 |
| [14 Page Structure: section moves, fields, text edits](tickets/14-guarded-edit-page-structure.md) | M | sol | 10 |
| [15 Pages and file operations, with their missing guards](tickets/15-guarded-edit-pages-and-files.md) | M-L | sol | 10 |
| [16 Media, agent and save waits hold a stamp](tickets/16-guarded-edit-media-agents-save.md) | S | sol | 10 |
| [17 Move applyNativeOperation/applyNativeChange behind the seam](tickets/17-guarded-edit-fold-apply-paths.md) | L | claude ★ | 11-16 |
| [18 Guard test: no untracked reads in plans or controllers](tickets/18-guarded-edit-read-guard-test.md) | S | sol | 17 |
| [19 A stylesheet GitHub can't read as text doesn't break the preview after it paints](tickets/19-unreadable-stylesheet-after-paint.md) | S | claude ★ | 17 |
| [29 A page GitHub can't read as text shows an error when opened, not a blank preview](tickets/29-unreadable-page-by-link.md) | S | claude ★ | 19 |

11 first (most proof bugs), then 12 and 13. Slices 11-16 all touch `src/main.ts` in different regions: at most two at once.

**Decided by the lead (2026-10-10), after slice 13:** the module's `select.historyOnly` option (forces the receipt path for a one-file step so Undo/Redo reselect) stays part of the interface. Slice 17 restores what 11, 13 and 15 accepted for now: Undo reselect and "Undid …" on range edits, the component stylesheet pane closing on Undo of Make component, plain-repo file ops without an open file.

## 2. Typed editor↔preview protocol, the runtime's rules shared

Rules the runtime (DOM) and the editor (source) both apply live once in `src/page-builder/rules/`, unit tested and bundled into the runtime; a rule that walks a tree takes a small view, with a DOM adapter in the runtime and source adapters in the editor. One preview link (`src/components/preview-link.ts`) types every message, matches replies to requests and renders, and drops stale messages; a fake frame adapter tests it. The wire format does not change. Design: `~/Projects/native-site-editor/.scratch/sturdy/frame-protocol-design.md`. None of these needs slice 10.

| Slice | Size | Builder | Blocked by |
| --- | --- | --- | --- |
| [20 The runtime is a bundle in dev, tests and build](tickets/20-runtime-bundle.md) | M | claude ★ | – |
| [21 Rule: card components, card slots, items slots](tickets/21-rule-cards-and-items-slot.md) | M | claude ★ | 20 |
| [22 Rule: repeated item kinds](tickets/22-rule-item-kinds.md) | S | sol | 20 |
| [23 Rule: which block a press or drag moves](tickets/23-rule-movable-block.md) | M | sol | 20, 21 |
| [24 Rule: inline formatting, text runs, phrasing sets](tickets/24-rule-text-level-tags.md) | S-M | sol | 20 |
| [25 Protocol types and one reader (no casts)](tickets/25-protocol-types-and-reader.md) | M | sol | – |
| [26 Preview link: replies, render versions, staleness; fake frame](tickets/26-preview-link.md) | L | claude ★ | 25 |
| [27 Runtime and host listeners on the shared wire; dead messages go](tickets/27-runtime-wire-and-listeners.md) | S-M | sol | 20, 26 |
| [28 Guard test: only the link talks to the frame; no copied rule sets](tickets/28-frame-guard-test.md) | S | sol | 21-24, 27 |

20 first, then the rule slices (21 before 23), then 25-27. 21-24 all edit `native-preview-runtime.js` (different regions): at most two at once. 25 has no real blocker but shares `native-preview.ts` with 26; run it after the rule slices. Lead decides before 21 and 24: the browser's reading wins for blank text and slot names, and the one inline-formatting list (proposed: card-grid's, with `data var del ins`).

**Decided by the lead (2026-10-10), for slices 21–24:** the browser's reading wins for blank text around slots and for slot names (slice 21); the single inline-formatting list is `card-grid.ts`'s, including `data var del ins` (slice 24; paragraphs with those tags become typeable on the canvas); shared rules live in `src/page-builder/rules/`; the runtime stays plain JS this week, checked by slice 27's message-name test.

## 3. One Block move

One module (`src/page-builder/block-move.ts`) answers "what does this press move, where may it go, and move it" for every way in: drags (canvas, edit bar name, Page Structure rows), Alt+arrows (canvas, bar, rows), the Section Move buttons and their palette commands, and MCP `move_section`. Inside: one engine (`nativeMoveEdit`), page and template rules as two adapters (`block-move-rules.ts`, replacing `native-move-choices.ts`), one guarded edit per move with items-slot templates read through `r`, Undo/Redo selection, and the moved path after. Pointer geometry (drop-target, tree-drop, section-snap, block-drag) stays out. Design: `~/Projects/native-site-editor/.scratch/sturdy/block-move-design.md`.

| Slice | Size | Builder | Blocked by |
| --- | --- | --- | --- |
| [30 Module and its page/template rules (no callers)](tickets/30-block-move-module.md) | M | claude ★ | 17 |
| [31 Alt+arrows, the bar's Section buttons and Page Structure rows](tickets/31-block-move-keys-bar-structure.md) | M-L | claude ★ | 30 |
| [32 Drags: canvas, edit bar name, Page Structure rows](tickets/32-block-move-drags.md) | M | sol | 30 |
| [33 MCP move_section; dead card Move buttons and swapEdits go](tickets/33-block-move-mcp-and-dead-card-moves.md) | S | sol | 31 |
| [34 Guard test: one move engine, one page/template choice](tickets/34-block-move-guard-test.md) | S | sol | 31-33 |
| [35 The two specs that fail under load pass reliably](tickets/35-flaky-specs.md) | S | claude ★ | – |

31 and 32 may run together (main.ts regions 520-614/1612-1722 vs 923-958). No file of 26/27 is edited (native-preview.ts keeps its `onMove`/`onBlockPress` handlers; the palette runs the bar's buttons as before); only main.ts is shared, in other regions. Run 31 before 18, or 18 allowlists the `itemsSlots()` peeks in page-structure-controller (712, 779) and main.ts (1693). Lead decides before 31-33 (design section 8, each recommended): B1 template Sections move by the template rules from the canvas and bar too; B2 a non-Section Structure row opens its page and moves, as Sections do; B3 Undo of every move reselects the block where it was; B4 Structure focus follows the real path after a Section or pending move; B5 Section Move buttons disabled at a slot's edge; B6 a row press on a Block that does not move starts no drag.

**Decided by Lex (2026-10-10):** B1–B6 all yes; slices 31–33 build them.

## 4. One card source reader

One interface (`SourceTree`, `src/page-builder/source-tree.ts`) for every HTML read card code makes: the element at a path as the preview counts it, its exact range, its attributes and text decoded as the browser reads them. Two adapters: the page adapter (`readPage`, the browser's parser and its cache in `native-source-location.ts`) for every path from the preview, and the source adapter (`readSource`, the pure `parseSource` moved from component-model) for templates, card markup and pages in Node tests; one contract suite runs on both, with parity on the fixtures. `elementTree`, card-grid's `plainText`, three entity decoders and four attribute readers go; card rules take a tree and run in Node. The strict editing tree stays the insert engine's. Design: `~/Projects/native-site-editor/.scratch/sturdy/card-tree-design.md`.

| Slice | Size | Builder | Blocked by |
| --- | --- | --- | --- |
| [40 Module, page and source adapters, contract and parity suites (no card callers)](tickets/40-source-tree-module.md) | M | claude ★ | – |
| [41 Card fill and Change look read markup through the tree](tickets/41-card-tree-fill-and-swap.md) | M | sol | 40 |
| [42 Card grids, slot links and sibling pages read page paths through the tree](tickets/42-card-tree-page-paths.md) | M | sol | 40, 33 |
| [43 Card copies on the tree: elementTree, plainText and the slot scan go](tickets/43-card-tree-copies.md) | M-L | sol | 41, 42, 45 |
| [44 Guard test: card files read HTML through the tree only](tickets/44-card-tree-guard-test.md) | S | sol | 41-43 |
| [45 An element's end stops at its parent's end tag, in both readers](tickets/45-element-end-at-parent.md) | S-M | claude ★ | 40 |

40 shares no file with 17, 25-27 or 30-34 and may start now; 41 (card-fill.ts, card-swap.ts only) may run beside 30-34. 42 edits cards.ts after 33 (which deletes the card `move` 42 would otherwise rewrite); 43 edits cards.ts after 42 and card-fill.ts after 41 (other functions). No slice edits main.ts (`gridOfItem` keeps a string overload), card-grid-controls.ts (26), native-insert.ts (30) or the runtime (27). Lead decides before 41-43 (design section 9, each recommended, each fixing an inconsistency): T1 page titles, descriptions and matched text written with character references (`Caf&eacute;`) read as the browser shows them in Link to a page and in a card fill, instead of being written as `Caf&amp;eacute;`; T2 Change look keeps alt text and link addresses with references as written; T3 "In this grid" and Create page's sibling pages are the card's own when a `<script>` sits among an instance's children; T4 an implied end tag inside an instance no longer loses Create page's sibling titles or mixes two slots of one card component; T5 Add card's copy writes a slot fallback's text as the browser shows it and takes a fallback holding a nested slot whole; T6 a card's link address is decoded once. Without a decision the slice keeps today's behaviour for that item.

**Decided by the lead (2026-10-10):** T1–T6 all yes. Each is a bug (text shown or written wrongly, wrong sibling pages), not a design choice; Lex is told in plain words when 41–43 land.

## 5. One Variant lookup

One module in `shared/` answers which Variants a tag (or `.btn`) has on the site, from the stylesheets and scripts the pages actually link, for the edit bar, the card looks, the code pane and `get_site` alike, behind a small files adapter (editor drafts, Worker `SiteFiles`).

| Slice | Size | Builder | Blocked by |
| --- | --- | --- | --- |
| [50 One Variant lookup for the editor and the Worker](tickets/50-one-variant-lookup.md) | M | claude ★ | – |
| [51 Page-band tags and reserved custom-element names live once in rules/](tickets/51-band-and-reserved-name-rules.md) | S | sol | 28 |

## 6. Edit component mode in one module

One module (`src/page-builder/component-mode.ts`, no DOM, in the entry chunk) owns what Edit component mode is: the opening the guarded edit's stamps hold (`entry()`), the framed instance and its chain of opened templates, every history share's lifetime (entry, mode, nested level, rename), renames followed across Undo/Redo, kept slot names, Make component's notes and the frame message, and one rule for when the mode lasts (`now()`: its template is the file open, its page is shown, the repository/branch/version view hold, its instance is where it was). Ports: stamps and `peek`, the file open and page shown, open, share, frame, changed; the memory workspace is the test adapter. The bar's view keeps its DOM and draws the module's state; components.ts, main.ts and Page Structure stop deciding whether the mode is on (sixteen predicates today). Design: `~/Projects/native-site-editor/.scratch/sturdy/edit-component-mode-design.md`.

| Slice | Size | Builder | Blocked by |
| --- | --- | --- | --- |
| [60 Module, memory adapter and suite (no callers)](tickets/60-component-mode-module.md) | M | claude ★ | – |
| [61 components.ts and the mode's bar on the module](tickets/61-component-mode-components.md) | L | claude ★ | 60 |
| [62 Callers ask the module; the mode ends when its page or its instance goes](tickets/62-component-mode-callers.md) | M | sol | 61, 33, 34 |
| [63 Guard test: mode state, shares and frame message only in the module](tickets/63-component-mode-guard-test.md) | S | sol | 62 |

60 adds files only (plus one optional field of the memory workspace and a CONTEXT.md entry) and may start now, beside 33, 34 and 42-44. 61 edits components.ts, edit-component-mode.ts and edit-component-chain.ts (deleted) and no file of 33 or 42-44; it keeps `editModeTemplate()`/`editModeEntry()`/`editingScope()` as one-line reads so main.ts is not edited. 62 edits main.ts and page-structure-controller.ts, which 33 also edits (other regions), and renames the query 34's guard test names: run it after 33 and 34. Lead asks Lex before 61 and 62 (design section 9, each recommended, each fixing an inconsistency): M1 the mode ends as soon as its page leaves the preview (a Ctrl/⌘+click on a link, an agent pin's Show page), instead of the bar saying "Editing … Done" with nothing framed until the next edit; M2 Make component's and + New component's notes show once, in the bar or else the status line, and a mode slower than 8 s to load no longer opens late; M3 the mode ends when its instance is no longer where it was on the page (an Undo past the mode's first step, an agent's change), instead of the frame vanishing under a bar that still says "Editing". Without a decision the slice keeps today's behaviour for that item.
