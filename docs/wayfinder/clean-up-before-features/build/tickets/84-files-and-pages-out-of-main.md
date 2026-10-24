---
title: "Files and Pages actions leave main.ts"
type: task (AFK)
status: closed
assignee: lead-84
builder: sol
blocked_by: [11-lazy-media-and-pages, 41-is-a-file-rule]
---

## Goal

`main.ts` towards about 500 lines ([ticket 05, item 1](../../tickets/05-grill-architecture-choices.md#resolution-2026-10-22); [TD 01](../../../../work/tech-debt/issues/01-main-ts-size.md)). The Files and Pages trees and explorer tabs (about lines 3440–3601 at `89ac5e0e`), the Pages controller wiring and Create (`planCreation`, `branchPathProblem`, 3602–3839), and the file actions, file operations, resync, Undo of file changes and save/publish wiring (3840–4169) move into a Pages & files host module. About −650 lines.

## Decided behaviour

No visible change. Where slice 11 made this code load when Pages & files opens, the moved module joins that lazy chunk ([ticket 04](../../tickets/04-grill-debt-and-fix-choices.md#resolution-2026-10-22): rarely used code loads when the Pages & files manager opens).

## Files

- `src/main.ts` (the regions above), new `src/pages-and-files-host.ts` (name is the builder's), `src/controllers/pages-controller.ts`, `src/controllers/file-operations-controller.ts`, `src/controllers/file-operation-checks.ts`, `src/controllers/save-publish-controller.ts` (ports only)
- Tests: affected unit tests (ports typed with `satisfies`); Pages, Files and save specs through `kit specs --affected`
- `tests/main-ts-ceiling.test.ts`, `docs/agents/code-map.md`

May split into 84a (trees, Pages, Create) and 84b (file actions and operations, save wiring) if one session cannot finish; say so in `decide`.

## Done when

- A moved function keeps its body; ports are live; one transaction per user action still holds (CODING_STANDARDS).
- `kit size` at or under 355 KB and not above slice 11's result by more than 1 KB (report the delta); `npm run check`, `npm test`, `kit specs --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Edits `main.ts`: at most one other `main.ts` slice at once.

- `kit doctor`; `kit bg slice-84 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/84-files-and-pages-out-of-main.md --builder sol`; `kit wait job slice-84 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected` plus `kit specs native-lazy-panels.spec.ts`, `kit size`.
- Review: `kit review --ticket <this ticket>` (GPT-6.1 Sol, medium, read-only). Land: `kit pr --ticket <this ticket>`.
- Report: unit and specs `RESULT:` lines, `kit size` delta, review folder and decisions, PR and merge SHA, `main.ts` lines before and after and the new ceiling.

## Done (2026-10-24)

- Not split: one session moved all three regions (no 84a/84b).
- New `src/pages-and-files-host.ts` (`createPagesAndFilesHost`, `PagesAndFilesPorts`, `ExplorerHost`) holds the Files and Pages trees and explorer tabs, the Pages controller wiring and the Pages actions/explorer loaders, `branchPathProblem`, the Files operations wiring, resync, Undo of file changes and the save/publish wiring. New `src/pages-and-files-explorer.ts` (`createExplorerActions`) holds what only the open explorer uses: Create (`planCreation`, `createFromRequest`), a Files row's menu (`fileRowItems`, `openCreateKind`, `copyFilePath`), rename and drop (`renameTarget`, `renameProblem`, `dropProblem`, `renameFileTarget`, `dropFileTarget`). It loads with the explorer's other modules when Pages & files opens. Each moved function keeps its body with `ports.` prefixes (main.ts values) and, in the explorer module, `host.` prefixes (the host's own state). Changes beyond prefixes: the explorer reset and toggle wiring that `mountWorkspace` ran inline is now the host's `mountExplorer()`, unchanged inside; `ensureExplorer` makes the explorer actions from the loaded module (one added line); `parentOf`, `nativePageRoute`, `parentProblem`, `newFilePath`, `newFolderPath` and `renamedPath` reach the explorer module through `host` (so `renameTarget` and `dropProblem` call `host.parentOf`), because importing them there split `native-create`, `native-page-moves`, `native-routes` and `custom-element-names` into extra boot requests (the split slice 11 avoided; a value import from the host split `native-pages` and `site-overlay` the same way). The toast and `announce`, `imagesSignature` and the cards controller stay in `main.ts`.
- Ports are live: mutable host state goes in through getters (`explorerDropdown`, `files`, `pageStructure`, `siteActions`, `fileGeneration` with its setter). `restoreFile`, `loadSnapshot` and `openEntry` (declared later) go through arrows. Queued page-title work is cleared through the `clearPendingTitles` port. `main.ts` reads `pageActions`, `pagesTree`, `fileOps` and `nativeResyncDone` from the host object at call time, and the explorer module reads `createDialog`, `fileActions` and `fileOps` through `ExplorerHost` getters. Three early port objects in `main.ts` (`editorWorkspace`'s `branchText` and `afterFileChanges`, media's `openPage`) now wrap them in arrows. Writes still go through the same guarded edits; no transaction changed.
- The host is eager: boot needs `pagesController` and `savePublish`. The lazy chunks from slice 11 (Pages actions, explorer dialogs, Files tree, file operations) still load when Pages & files opens, now through loaders inside the host, joined by the explorer actions.
- `src/main.ts`: 3,859 → 3,098 lines (−761); ceiling 3,900 → 3,100. `tests/main-ts-ceiling.test.ts` also checks that the Pages & files host's destructured members are not used before their line.
- `kit size`: boot 351 KB, −1 KB against this slice's `dev` base (`dev@63d006f`, 352 KB); 34 boot requests, as on `dev`. Slice 11 ended at 341 KB, but slices landed since took `dev` to 352 KB before this one started, so the delta this slice owns is the one against `dev`: −1 KB. The main chunk is 228.88 KB gzip against 229.33 KB on `dev`. New lazy chunks: `pages-and-files-explorer` (2.27 KB) and `media-names` (0.46 KB), neither loaded at boot.
- Known cost: `PagesAndFilesPorts` has about 70 unminified port names, and `ExplorerHost` adds six helper names. Boot still ends 1 KB under `dev`; shortening the most-used names is left to the port-slimming follow-up (TD 01).
- Tests: new `tests/pages-and-files-host.test.ts` (fake ports checked with `satisfies`, a real site runtime and the real draft store; each test removes its drafts in `t.after`) covers: the tree state and path checks follow the draft scope at call time; Restore brings a deletion back with one refresh and one announcement; after a file goes, the page opens through a port read when it runs; Restore of the open file moves `fileGeneration` through the host's setter (0 → 1) and leaves the page; a home page drafted in a site-less repository sets `nativeResyncDone`, opens the project again after a microtask and clears the wait once the load ends; Create (through `createExplorerActions` with the real host's members) refuses `notes.txt` with "notes.txt already exists." and makes `docs/.gitkeep` as a draft with no base blob; `pageActions` is read from the host once `loadPagesActions()` resolves, while a copy taken before stays empty; a change's Restore says "Restored notes.txt.", Move back says "Moved new.txt back to old.txt.", and an upload's Discard goes to the `discardUpload` port; with the explorer's components stubbed, the real `ensureExplorer()` hands its `ExplorerHost` to the row actions, so a gone file's Restore reaches the loaded file operations (draft removed, "Restored notes.txt.") and `dropProblem` uses the host's `parentOf`; `mountExplorer()` clears `pagesTree` and the next `ensureExplorer()` builds the row actions and Pages tree again. `tests/main-ts-ceiling.test.ts` also checks that main.ts hands the host no `let` by value and `fileGeneration` as a getter and setter. `docs/agents/code-map.md` updated (host and explorer row, section ranges, `afterFileChanges`).
- Validation, at the final tree: `kit unit --affected` `RESULT: ok unit 19/19 (2 files)`; `npm test` 5386/5386; `kit specs --affected` (includes native-lazy-panels, create, files-tab, discard and file-ops) `RESULT: ok specs 126/126 passed`; `kit size` `RESULT: ok size boot 351 KB (-1 KB) vs dev@63d006f, budget 355 KB`; `npm run check` and `npm run lint` green.

### Follow-ups

- Spec (P2): f810d301:docs/wayfinder/clean-up-before-features/build/tickets/84-files-and-pages-out-of-main.md:46 — P2: The ticket says "`src/main.ts`: 3,859 → 3,098 lines (−
- Spec (P2): f810d301:docs/wayfinder/clean-up-before-features/build/tickets/84-files-and-pages-out-of-main.md:47 — P2: One "Done when" item says `kit size` must be "not abov
- Spec (P3): f810d301:docs/agents/code-map.md:259 — P3: The section ranges were measured before the rebase. "Draft baseline, agent/boot ports and startup" ends at 3099, but 
- Standards (P3): dc553b86:src/pages-and-files-host.ts:68 — P3: Rule broken: CODING_STANDARDS "Controllers — Ports and API names cost bytes … prefer few, short port names." `Page
- Validation gaps (gap): `mountExplorer()`'s `toggle` listener (src/pages-and-files-host.ts:729–740) is untested. That covers both branches: open runs `ensureExplorer` → `renderTree` → 
- Validation gaps (gap): `savePublish`'s `confirm` port, which now appends `discardDialog` to `ports.app` and `confirmDialog` to `ports.element("explorer")`, has no unit test. Test to a

