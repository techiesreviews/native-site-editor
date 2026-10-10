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
