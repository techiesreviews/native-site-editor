---
title: "Rarely used code loads when Media or the Pages & files manager opens"
type: task (AFK)
status: open
assignee:
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

## Acceptance checks

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
