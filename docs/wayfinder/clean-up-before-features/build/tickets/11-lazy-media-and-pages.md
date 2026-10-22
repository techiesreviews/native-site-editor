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
- Commits: `f5f63f7f` carries the lazy split (the loaders, `ensureExplorer`, `pages-state.ts`, the new spec and ceiling); `9c0e38d0` carries the review fixes (chunk waits hold a `"repository"` stamp; `file-operations-controller.ts` and `native-settings.ts` import from `pages-state`). `0379a001` carries the second review's fixes (`UrlPlan.pending` in `src/components/url-change.ts`, three lazy-panels cases: the `pages-controller` and `confirm-dialog` chunk failures and the Discard branch-switch race, and this Done text). The third review's fixes (a plain-repository Files case, this line) are in the commit after it.
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
- Outside the Files list, by need: `file-operations-controller.ts` and `native-settings.ts` import `pageLinkSources` / `NATIVE_HOME_UNREAD` from `pages-state` (so the file-actions chunk does not pull page actions); `native-media-adding.spec.ts`'s `filesTab` waits for the Files tree before dropping, since the tree now loads on first open.
- `kit specs --affected` (63 specs): 61 passed; `native-media-adding.spec.ts:385` dropped files before the lazily mounted tree existed (helper fixed above) and `native-agent-quiet.spec.ts:153` (live waits) failed once; both passed on rerun with history, discard, MCP, site settings, page URLs, create and lazy panels: `RESULT: ok specs 9/9 passed`.
- Review (Claude Opus 5.5, read-only; `.scratch/reviews/runner-11/20261022T091855Z` in the main checkout). Fixed: P1 Restore this version did nothing (a full stamp always fails in version view): the waits for a chunk in Restore version, Discard, agent answers, Files "+ New", the page-settings URL and agent page creation now hold a `"repository"` stamp (scope and generation), so a page or mode change while a chunk loads no longer cancels them silently; P2 the static imports through `pages-controller` (above); nit: the spare listings clear with the tree. Rejected: P2 ceiling growth (Lex's rule lets a slice grow `main.ts` when Done explains it; this ticket keeps whole functions in `main.ts`); gaps for a dedicated restore, discard, URL-field and cold agent move/delete spec (covered by the history, discard, page-URL and MCP specs above) and an automatic-reload case (the spec presets the reload key so a failed chunk cannot reload-loop the test; `chunk-recovery` has its own tests); nits `openFolder` before the tree mounts (the tree draws folders afresh on first open) and the chained reset assignment (kept short on purpose).
- Second review (Claude Opus 5.5) fixed: P3 Done named no commits (line above); P3 the page-settings URL field showed "Loading page actions…" as an error while page actions load: `UrlPlan` gains `pending` (neutral note, Apply stays off; `src/components/url-change.ts`); gaps: the lazy-panels spec now also fails the `pages-controller` chunk (Pages) and the `confirm-dialog` chunk (Discard) once and recovers, and holds the `confirm-dialog` chunk while the branch changes, then checks no dialog opens and main's draft stays (fails with the stamp check removed). Rejected: an await-race test for each of the other four stamped waits (they share the same `stamp`/`holds()` shape; one browser race proves it). Nits not taken: the `PagesPorts` alias, a `spareListings` note, TD 02's status (outside this ticket's Files).
- Third review (Claude Opus 5.5) fixed: P3 Commits named no `0379a001` (line above); gap: a repository with no site (the fake server's README-only `no-site` repo, default group: `@actual` is the real starter, a native site too) opens Files with the chunk held ("Loading files…"), renames README.md, and again after `pages-controller` fails once and the page reloads. Nits taken: the per-panel failure case calls `failOnce`; a comment marks the URL field's `pending` plan as a guard for the sidebar field, hidden today. Nits not taken: sharing the files tree's `visible` expression, and a "could not load" hint in Pages (the notice already offers the reload).
- Shots: `kit shots pages files media-gallery` (first open; 390px Pages caught the loading state): `.scratch/shots/runner-11/20261022-091310/` in the main checkout; two tap-target findings on the existing Pages URL buttons at 768px, unchanged by this slice.
