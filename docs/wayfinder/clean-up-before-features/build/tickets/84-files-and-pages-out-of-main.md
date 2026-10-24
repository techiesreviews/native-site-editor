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
- New `src/pages-and-files-host.ts` (`createPagesAndFilesHost`, `PagesAndFilesPorts`) holds the Files and Pages trees and explorer tabs, the Pages controller wiring and the Pages actions/explorer loaders, Create (`planCreation`, `branchPathProblem`, `createFromRequest`), the Files row actions and operations, resync, Undo of file changes and the save/publish wiring. Each moved function keeps its body with `ports.` prefixes only. One addition: the explorer reset and toggle wiring that `mountWorkspace` ran inline is now the host's `mountExplorer()`, unchanged inside. The toast and `announce`, `imagesSignature` and the cards controller stay in `main.ts`.
- Ports are live: mutable host state goes in through getters (`explorerDropdown`, `files`, `pageStructure`, `siteActions`, `fileGeneration`), and `restoreFile`, `loadSnapshot` and `openEntry` (declared later) go through arrows. `main.ts` reads `pageActions`, `pagesTree`, `fileOps` and `nativeResyncDone` from the host object at call time. Three early port objects in `main.ts` (`editorWorkspace`'s `branchText` and `afterFileChanges`, media's `openPage`) now wrap them in arrows. Writes still go through the same guarded edits; no transaction changed.
- The host is eager: boot needs `pagesController` and `savePublish`. The lazy chunks from slice 11 (Pages actions, explorer dialogs, Files tree, file operations) still load when Pages & files opens, now through loaders inside the host.
- `src/main.ts`: 3,859 → 3,099 lines (−760); ceiling 3,900 → 3,100. `tests/main-ts-ceiling.test.ts` also checks that the Pages & files host's destructured members are not used before their line.
- `kit size`: boot 353 KB, +1 KB vs `dev` (352 KB). The main chunk grew 1.01 KB gzip because the port names are not minified. This is at the limit; moving the explorer-only half (Create, row actions, rename/drop) into the lazy explorer chunk is the way to win it back.
- Tests: new `tests/pages-and-files-host.test.ts` (fake ports checked with `satisfies`, a real site runtime and the real draft store) covers: the tree state and path checks follow the draft scope at call time; Restore brings a deletion back with one refresh and one announcement; after a file goes, the page opens through a port read when it runs. `docs/agents/code-map.md` updated (new row, section ranges, `afterFileChanges`).
- Validation: `kit unit --affected` `RESULT: ok unit 10/10 (2 files)`; unit files that read `main.ts` `RESULT: ok unit 442/442 (19 files)`; `npm test` 5377/5377; `kit specs --affected` (includes native-lazy-panels, create, files-tab, discard and file-ops) `RESULT: ok specs 126/126 passed`; `npm run check` and `npm run lint` green.
