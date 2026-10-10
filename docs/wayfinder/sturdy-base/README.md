# Sturdy base

A week (from 2026-10-10) of cleanup under the editor, no new features. Order: (0) agent-drift bugs, (1) one guarded edit module, (2) a typed editor↔preview protocol, (3) one Block move module, then (6) one HTML source-tree reader for cards, (4) Edit component mode in one module, (5) one Variant lookup.

Tickets are numbered by candidate: 01-09 for (0), 10-19 for (1), 20s for (2), 30s for (3). Each slice lands on `dev` with `npm run check`, `npm test` and the full `native-save` suite green, and deploys to preview only. ★ = a Claude agent builds it; the rest go to Sol.

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

11 first (most proof bugs), then 12 and 13. Slices 11-16 all touch `src/main.ts` in different regions: at most two at once.

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
