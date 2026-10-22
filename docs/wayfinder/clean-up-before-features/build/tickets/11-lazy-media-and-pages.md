---
title: "Rarely used code loads when Media or the Pages & files manager opens"
type: task (AFK)
status: closed
assignee: runner-11
builder: sol
blocked_by: [10-main-ts-ceiling]
---

## Goal

Free room under the 355 KB byte budget before the architecture slices add module boundaries. `kit size` reads 355 of 355 KB on `dev` ([TD 02](../../../../work/tech-debt/issues/02-byte-budget-headroom.md), research 02); any slice that adds boot code fails today.

## Decided behaviour

[Ticket 04](../../tickets/04-grill-debt-and-fix-choices.md#resolution-2026-10-22): keep the budget at 355 KB; rarely used code loads **when Media or the Pages & files manager is opened**. The first visit stays as fast as today; the first opening of Media or Pages & files may take a fraction of a second longer and shows the panel's usual loading state, never a blank or broken panel. A failed chunk load goes through the existing chunk recovery (`src/chunk-recovery.ts`).

Lead decision: free at least 8 KB gzip (TD 02's estimate for file and page actions); report what moved and the number.

## Files

- `src/main.ts`: eager imports used only once Pages & files or Media is open. Candidates from today's import list: the action half of `controllers/pages-controller`, `components/create-dialog`, `components/file-row-actions`, `components/confirm-dialog`, `components/page-picker`, `native-create`, `controllers/files-tree-controller`, the eager half of `controllers/media-controller`. One `lazyModule(...)` loader per group, as `loadPagesTree` and `loadMediaWorkspace` already do. Whole functions stay in `main.ts` here (slice 84 moves them).
- The modules above, only where they must split into "needed at boot" and "needed on open".
- `tests/perf/byte-budget.ts` stays unchanged.
- `tests/main-ts-ceiling.test.ts` (new ceiling); `docs/agents/code-map.md` if an entry moves; one new spec, `tests/native-save/native-lazy-panels.spec.ts`.

## Done when

- `kit size` at least 8 KB under its `dev` base, and at or under 355 KB.
- The new spec opens Pages, Files and Media from a cold boot and acts once in each (create a page, rename a file, open a tile), and once more after a failed chunk load.
- CODING_STANDARDS "Lazy stays lazy" and "Module order holds" hold.
- `npm run check`, `npm test`, affected specs green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)).

- `kit doctor`; `kit bg slice-11 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/11-lazy-media-and-pages.md --builder sol`; `kit wait job slice-11 --timeout 2h`.
- While building: `kit size` before and after; `kit unit --affected`; `kit specs --affected` plus `kit specs native-lazy-panels.spec.ts native-media-library.spec.ts native-boot-requests.spec.ts`.
- `kit shots pages files media-gallery` (first open).
- Review: `kit review --ticket <this ticket>` (GPT-6.1 Sol, medium, read-only). Land: `kit pr --ticket <this ticket>`.
- Report: `kit size` before and after (KB), what moved, unit and specs `RESULT:` lines, the shots contact sheet, review folder and decisions, PR and merge SHA, `main.ts` lines and new ceiling.

## Done (2026-10-22)

- Built by Claude Opus 5.5 from Sol's partial build (Sol stopped at its usage limit; Lex: Claude builds and reviews meanwhile, so `builder: sol` is superseded). `kit slice` refused to switch the saved slice's builder, so the runner finished it by hand (runner.md manual fallback).
- **Boot: 355 → 341 KB** gzip before first preview paint (`kit size`: -14 KB vs `dev`), requests 35 → 32, total 1444 → 1431 KB.
- What moved out of boot, each behind one `lazyModule(...)` loader in `main.ts`:
  - **Pages actions** (`loadPagesActions`): `pages-controller` split; its boot half (tab state, tree drawing, page labels, home template, address, shared types) is the new `src/controllers/pages-state.ts`; rename, duplicate, delete, move, Change URL and new pages load with the Pages tree, Site/Page settings, the page-settings URL field or an agent's page command.
  - **Explorer** (`loadExplorerModules`, mounted by `ensureExplorer`): `create-dialog`, `file-row-actions`, `page-picker`, `files-tree-controller` and `confirm-dialog`, on the explorer's first opening (Pages, Media or Files). The Pages and Media panels show "Loading pages…" / "Loading media…" until then.
  - **Files checks and actions** (`loadFileOps`): `file-operation-checks` (with `native-files` and the media-family rules) now loads with the explorer, Pages actions or an agent's file command, not at boot.
  - The confirm dialogs (`loadConfirmDialog`) load with their first question (Discard, Restore version, agent file answers).
- Kept eager: `native-create` (boot already needs it through `native-pages` and `cards`; loading it lazily only split it into an extra boot request) and the media controller (its edit-bar half is boot code; its gallery and actions were already lazy).
- A chunk that fails to load goes through `chunk-recovery` (`errorMessage` hands chunk failures to `handleChunkLoadFailure`; the chunk notice is placed like other notices). Path checks before the Files tree loads keep a spare listings map (tree SHAs, so never stale).
- **`main.ts`: 5,650 → 5,728 lines** (ceiling 5,650 → 5,730). It grows because the explorer's eager construction becomes lazy wiring: loaders, `ensureExplorer`, a small Files-tree facade, and stamp-guarded waits where an action now waits for its chunk. The functions stay in `main.ts` as this ticket requires; slice 84 moves them out.
- Tests: `tests/native-save/native-lazy-panels.spec.ts` opens Pages, Files and Media from a cold boot with the chunk held (loading state shown, no panel module requested at boot), then creates a page, renames a file and opens a media tile; each again after a failed chunk load and manual reload. `kit unit --affected`: `RESULT: ok unit 521/521 (21 files)`. `kit specs` lazy-panels, media-library, boot-requests, create, discard, file-ops, files-tab, page-urls, file-move-race, explorer-size: `RESULT: ok specs 10/10 passed`. `npm run check` and `npm run lint` green.
- Shots: `kit shots pages files media-gallery` (first open; 390px Pages caught the loading state): `.scratch/shots/runner-11/20261022-091310/` in the main checkout; two tap-target findings on the existing Pages URL buttons at 768px, unchanged by this slice.
