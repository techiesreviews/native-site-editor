---
title: Trim the boot bundle again
type: task (AFK)
status: closed
assignee: claude (mm-102 runner)
blocked_by: [78-prefix-every-writer]
builder: sol
phase: 7
---

## What

After slice 78 (951fb9bf) the editor's boot bundle measures about 353.6 KB gzip of the 355 KB budget (`npm run test:budget`, enforced in CI), while slices 79 (Change URL and redirects), 80 (change site address) and 81 (GitHub Pages and rules) still need room.

Win back at least ~8 KB gzip with **no behaviour change**: move boot code that first paint and first interaction do not need into lazily loaded chunks (dynamic `import()`, through the shared `lazyModule`), the way slice 84 did. Candidates: media-manager code that only runs after the user opens Media, a popup, Site settings, Improve images or Clean up; the `html-entities` table; `refusal-note.ts`, `publish-menu.ts`/`repository-menu.ts` bodies; the site-path-prefix helpers only if first paint does not need them. Add no dependencies.

Slice 79 runs in parallel and edits Change URL / redirects code: keep churn in those files to the minimum the move needs.

## Done when

- `npm run test:budget` measures boot at least ~8 KB gzip lower than before (before and after reported precisely, in bytes).
- Nothing the user sees or does changes: first paint and first interaction never wait on a new network request for something shown immediately (prefetch the chunk on idle where needed). `npm run check`, unit tests, `npm run lint`, the touched browser specs and the full native-save suite (`scripts/agents/full-suite.sh 3`) pass, failures matched against `tests/known-failures.json`.
- No new dependencies; every moved module loads on the action that needs it.

## Done (2026-10-15)

- **Behaviour.** None changed. What first paint and first interaction need stays in boot; the rest loads with the action that needs it, through `lazyModule` (chunk recovery included).
  - `src/controllers/media-actions.ts` (new): the media workspace reads, image, insert and address pickers, description bookkeeping, gallery lifecycle and framing operations. `media-controller.ts` keeps the Media badge, usage and edit-bar hooks and delegates, re-checking the repository (and for a picture swap the page's source) across the load.
  - `src/media-batch.ts` (new): the media batch staging body from `main.ts`; the host wrapper keeps the page open at the ask and refuses a repository or page switch while either chunk loads.
  - `src/controllers/file-operation-checks.ts` (new): Files validation (move problems, protected pages, link notes) and Restore stay synchronous in boot; `file-operations-controller.ts` (move, delete, duplicate) loads on the action behind a facade that holds the stamp, file list and target drafts from the press. Refusals that need no GitHub (protected home page, already deleted, a taken or unchanged name, nothing to duplicate) still answer at once, without the chunk or the text index.
  - `shared/media-records-path.ts` (new): `MEDIA_RECORDS_PATH` alone, so boot skips record parsing.
  - Bodies moved as they were, with `ports.` prefixes; slice 103's newest-first date line followed `workspaceContext` into `media-actions.ts` on rebase.
- **Not moved, on purpose.** `src/native-page-moves.ts` (lead's suggestion after slice 79): the Change URL field sits in Page Structure, visible at first paint, and plans the move synchronously on every keystroke; deferring it needs an async re-check in `url-change.ts` for ~1.5 KB. The `html-entities` table (13 KB) is read synchronously by the parser behind first paint. Publish and repository menus render at first paint.
- **Commits.** fbba8842 claim; 44d1025d the moves (built by Sol, comments restored by the runner); 64c54ae5 ticket status; 3fb236cd review fixes; close.
- **Tests.** `npm run check`, `npm run lint`, unit 3403/3403. New unit tests: held action chunks with generation, target-draft and resync drift (Sol); immediate Files refusals with zero chunk or index loads; media batch held at the workspace load and at the repository listing with a repository or page switch (nothing staged or recorded). Full suite (3 shards): 1053 passed, 2 failed, 60 skipped; both failures (`native-add-panel:149`, `native-improve-images:86`) came right after a Vite page reload caused by runner edits during the run, and both pass on the final tree with the touched specs (add panel, improve images, file ops, file-move race, media transaction, picker, rename: 39/39).
- **Review (GPT-6.1 Sol).** Evidence: `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-102/`. Fixed: P2, Delete of the protected home page waited for the chunk and index before refusing (now immediate; move and duplicate front-loaded the same way). Gaps added: the protected-Delete test and media-batch switch tests. Rejected: none. No re-review (the fix front-loads existing checks).
- **Bytes.** Cold bytes before first preview paint (median of 3, `100/20`, against dev b2bf00ed): **362,290 → 354,098 (−8,192 B)**, i.e. 353.8 KB → 345.8 KB of the 355 KB budget (9,422 B headroom). Boot `index` JS 240 KB → 227 KB on the wire. Two more requests before paint (`native-pages`, `native-page-moves` became shared chunks, preloaded in parallel; no added bytes).
- **Follow-ups.** Next candidates if slices 80/81 need more: pack the `html-entities` table (identical decoding, unit-proved), or idle-prefetch `native-page-moves`' planning half with a re-check in `url-change.ts`.
