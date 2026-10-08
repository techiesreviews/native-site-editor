# Phase 5: continue handoff (2026-10-08)

Supersedes [p5-slices-handoff.md](p5-slices-handoff.md) as the starting point;
that file keeps the full per-slice record. Claude orchestrates; grunt subagents
build one slice per branch; Claude Opus 5.5 / medium reviews read-only through
the CLI (runner scripts: root `.scratch/p5-review/run-*-review.py`; copy the
latest one and change worktree, head and prompt).

## Update (2026-10-08, night): plan slices done, warm target met

Preview `1d8c1a1f` (dev `bddbdf9`). Since the evening update:

| Branch | What | Review | Gates |
| --- | --- | --- | --- |
| `build/p5-shared-sections-controller` | Slice 12b, shared sections controller ([p5-19](p5-19-shared-sections-controller.md)); main.ts 6786 → 6108 | Sol, no defects | full 729 / 85 / 0; native-static 40 / 13 / 0; harness 22 |
| `perf/p5-boot-memory` | Ticket 02 warm lever "Remember last boot" ([p5-17](p5-17-boot-memory.md)) | Opus, then five Sol rounds (deleted branch, stalled guess, failed branch list, bounded wait, abandoned guesses); last P3 accepted and recorded in p5-17 | full 740 / 85 / 0; 1,182 units; budget 351 / 355 KB |

Ticket 02 on the merged build (100 ms / 20 Mbps, median of 5): cold first
paint 941 ms (≤ 1.0 s), warm 341 ms (≤ 0.4 s). Same-sitting A/B before the
merge: cold dev 941 vs branch 932.5, so boot memory does not slow cold.
Warm waterfall: snapshot, files, session and repositories in one wave
(130–243), runtime from cache 276–279, paint 341.

All six slices of [p5-controller-plan.md](p5-controller-plan.md) (11–16)
are on dev, but main.ts is 6108 lines, not the plan's "about 500" (ticket 08).
The rest needs a new plan: the planners and builders found most of what
remains is host state, transactions, DOM wiring and ports that the plan's
slices left in main.ts on purpose.

Open issues:

- The actual-starter group (`npm run test:browser:actual`) has 11 failures on
  dev `30a51e0` and later, independent of these slices:
  `native-card-paths-starter.spec.ts:126` (four themes),
  `native-slot-published-actual.spec.ts:107`,
  `native-static-section-save-host.spec.ts:204/276/298/318`,
  `native-structure-readiness.spec.ts:37` (two variants).
- On 2026-10-08 at 17:26 a full suite lost its 5216 server mid-run (536
  connection refusals); no OOM, no server error, not reproduced on two reruns.
  Cause unknown.
- CI deploy-preview has no `CLOUDFLARE_API_TOKEN`, so it tests but does not
  deploy (Lex will set it up later); preview deploys stay manual.

## Update (2026-10-08, evening)

Landed on dev, preview `a80dfc3b`; main.ts 8095 → 6786:

| Slice | What | Built / reviewed | Gates |
| --- | --- | --- | --- |
| 12a | Page structure controller ([p5-18](p5-18-page-structure-controller.md)), main.ts −730 | Sol / Opus | full 729 / 85 / 0 |
| 15 | Save/publish controller ([p5-22](p5-22-save-publish-controller.md)); two discard/deleted-upstream review fixes | Claude / Opus | integration full 729 / 85 / 0 |
| 14 | File operations controller ([p5-21](p5-21-file-operations-controller.md)), −403 | Sol / Opus, rebase by Sol review | integration full |
| 13 | Cards controller ([p5-20](p5-20-cards-controller.md)), small; edit bar reaches it through a `cardControls` port | Claude / Opus, rebase by Sol review | integration full |
| — | Byte budget raised to 355 KB (Lex: controller port names do not minify); now 349 KB | | |

Lex's rules from this evening:

- Code review is always GPT-6.1 Sol, read-only:
  `codex exec -m gpt-6.1-sol -c model_reasoning_effort=medium -s read-only -C <worktree> -o result.md - < brief.txt`
  (replaces the Opus CLI review above).
- Sol cannot commit from `-s workspace-write`; the lead commits its work with a
  Sol co-author line after checking the diff.
- More test ports while resources allow: root `.scratch/p5-perf/ase-port.sh <cmd>`
  runs on the first free of 5226, 5236, 5246, 5256 (lock per port, needs 4 GB
  free); full suites on 5216 under `/tmp/ase-5216.lock`; timing with
  `.scratch/p5-perf/ase-timing.sh <cmd>` (all five locks).

Not merged yet: `perf/p5-boot-memory` (warm 347 ms, cold 926; last fix for a
stalled guess blocking the branch picker, then Sol review and full suite) and
slice 12b `build/p5-shared-sections-controller` (Sol building).

## Update (2026-10-08, afternoon)

Landed on dev, preview `e7de7159`:

| Commit | What | Gates |
| --- | --- | --- |
| `060b406`..`ea213c7` | Slice 11: Pages tree, explorer tabs and new-page creation moved into `pages-controller.ts` ([p5-16](p5-16-pages-tree-create.md)); main.ts 8215 → 8095 | Opus review clean; 1,109 units; 11 pages specs 95 / 0; smoke 32; full native-save 729 / 85 / 0 |
| `35a2f5d` | Specs wait for the copied prompt before reading the clipboard (the CI deploy-preview smoke run on `a47abed` failed at `native-mcp.spec.ts:62`: the hint shows before the clipboard write ends) | 5 touched specs 50 / 0 |

Ports (Lex, 2026-10-08): full suites and timing on 5216 (`/tmp/ase-5216.lock`);
focused specs and smoke also on 5226 and 5236 (`/tmp/ase-5226.lock`,
`/tmp/ase-5236.lock`; each uses port + 1 too). Timing runs take all three
locks in the order 5226, 5236, 5216 so nothing runs beside them.

Warm lever (Lex chose "Remember last boot"): warm waterfall on `a47abed` is
0–127 HTML and eval, 127–237 session + repositories, 249–362 snapshot +
branches + hub, 365–478 page reads, 478–526 render (warm 526, cold 927). Per
repo id, remember login, full name, branch, commit and the first paint's
paths and SHAs (no contents); read it at boot start and fire snapshot and
SHA reads with session/repositories; adopt only after session login,
repository id → full name, branch, receipts and generation prove it, and a
file only when the fresh snapshot has the same SHA. Branch
`perf/p5-boot-memory`, ticket p5-17.

Slice 16 (Monaco trim) is already in dev (`da7cc2b` is an ancestor).

In flight (one worktree each, `native-site-editor-p5-<name>`): slice 12a
`build/p5-structure-controller` and 12b `build/p5-shared-sections-controller`
(Sol), 13 `build/p5-cards-controller` (on slice 11), 14
`build/p5-file-operations-controller` (Sol; owns move/delete/duplicate/restore),
15 `build/p5-save-publish-controller` (owns discard, deleted upstream, head
trust, publish refresh). Planner plans in root `.scratch/p5-plan/`. Merge order
11, 13, 12a, 12b, 14, 15, boot memory; each rebased, reviewed, full suite.

## Objective

Finish the `src/main.ts` controller split per
[p5-controller-plan.md](p5-controller-plan.md) (ticket 08: main.ts down to
wiring, roughly 500 lines) and meet ticket 02's timing targets (cold first
preview paint ≤ 1.0 s, warm ≤ 0.4 s, 100 ms / 20 Mbps, median of 5).

## Authorization and constraints

- This work lands on `dev` only: commit, `git push origin dev`, then
  `npm run deploy:preview` from `/home/ubulex/Projects/native-site-editor-dev`
  (preview-editor.techies.tools). Never `main`, never `deploy:techies`, even
  though the general memory says "commit on main and deploy".
- Before merging a slice: diff review, Opus CLI review (fix real defects, rerun
  narrow follow-up review), `npm run check`, units, touched browser specs, and
  the full native-save suite on the exact head for shared plumbing.
- Browser runs: port 5216, one worker, every Playwright run wrapped in
  `flock /tmp/ase-5216.lock <cmd>`. Never wait-loop with `ps`/`pgrep -f`
  patterns (they match their own command line and deadlock); never
  `pkill -f` (it kills your own shell); kill only PIDs you started. Never edit
  a worktree while a suite runs from it.
- Node 24: `export PATH=/home/ubulex/.npm/_npx/387698761821791d/node_modules/node/bin:$PATH`.
  Worktrees symlink `node_modules` from `native-site-editor-p5-review-fixes`;
  symlink the root `.scratch/native-static-preview` into a worktree's
  `.scratch` for `npm run test:browser:native-static -- --port 5216 --workers=1`.
- After a visible change on preview: screenshot it on the real starter
  (`ASE_NATIVE_SAVE_PORT=5400 ASE_NATIVE_SAVE_FIXTURE=~/Projects/native-site-editor-starter npx tsx tests/native-save/server.ts`
  from the dev worktree after the deploy build; sign in via `/auth/login`), save
  under root `.scratch/preview-shots/<version>/` and show it in chat.
- Another session works on dev in parallel (docs under
  `docs/wayfinder/components-and-builder/`, 2026-10-08). Fetch and rebase
  before pushing; don't touch that folder.

## State on dev (`origin/dev`, after this file)

Preview `07a7e5d2` is current; `main.ts` 8215 lines. Landed this session:

| Commit | What | Gates |
| --- | --- | --- |
| `260fa94` | Slice 9, boot controller ([p5-12](p5-12-boot-controller.md)) | full native-save 708 / 85 / 0 |
| `22e84b4` | Shared-section offers wait for the text index (the 20 native-static failures were a regression from merge `b2ba723`) | native-static 40 / 13 / 0, full 708 / 85 / 0 |
| `043101e` | Slice 10, preview selection controller ([p5-13](p5-13-preview-selection-controller.md)) | full 708 / 85 / 0 |
| `44f7524` | Page Structure in-place editing (Lex designed it via a prototype; see p5-slices-handoff) | full 719 / 85 / 1 (spec fixed) |
| `7acbc17` | Preview runtime hashed under `/assets/`, immutable; 8 s ready watchdog ([p5-14](p5-14-runtime-cache.md)) | full 721 / 85 / 0; live headers verified |
| `43100c4` | Component icon is Phosphor `diamonds-four` (Lex) | structure/edit-bar specs 157 / 9 / 0 |
| `91cf8ab` | Slice 10b ([p5-15](p5-15-preview-preload.md)): preview frame attached early, parked (`preview-frame-state.ts`), reloaded in place with a load-numbered `ready`; the site's own stylesheets (≤ 24 KB, best-effort, `live()`-guarded) read with the page in the first wave | full native-save 728 / 85 / 0 on `d0fdafa`; guard fix `cfff8fd`: focused 89 / 7, smoke 32, native-static 40 / 13 / 0 (full skipped by Lex's call); three Opus rounds, last defect fixed |

Baselines now: 1,100 units; full native-save 728 passed / 85 skipped / 0
failed; native-static 40 / 13 / 0; budget 347 KB of 350 KB.

## Not merged

- `proto/structure-sidebar` (`d3df960`): the four-look Page Structure prototype.
  Keep, do not push or merge.

## Timing (median of 5, 100 ms / 20 Mbps, `tests/perf/cold-start.ts`)

After slice 10b: default fixture cold paint about 936 ms, warm about 534 ms;
real starter (`ASE_NATIVE_SAVE_FIXTURE=~/Projects/native-site-editor-starter`)
cold about 918 ms, warm about 535 ms. Cold meets the 1.0 s target; warm misses
0.4 s. What remains before warm paint: the session and snapshot reads, one
page-read wave, about 95 ms of render, and the preview runtime (now just on
the critical path, about 15 ms; the dropped boot-time runtime fetch, signal A
in p5-15, could win that back). Always measure before and after in one
sitting, each run confirmed to serve its own `index-*.js`.

## Watch list

- Flaky specs, all pre-existing on dev: `native-shared-link-host.spec.ts:82`
  (1 in about 6 runs), `native-canvas.spec.ts:195` (dev 3/30: the hover lands
  before Monaco paints the line), `native-shared-authoring-host.spec.ts:282`
  (dev 9/10; fixed 1.5 s wait).
- Slice 10b known limits (p5-15): a deploy can auto-reload a tab showing a
  non-native repo after a native one (drafts flushed, loop-guarded); the
  stale-predicted-read regression test passes with or without the fix.
- Page Structure editor known limits (p5-slices-handoff "Page Structure
  in-place editing").

## Next actions

1. Ticket 02 warm target (0.4 s): waterfall the warm load on dev and propose
   the biggest remaining lever to Lex before building.
2. Slices 11–15 of the controller plan (pages, structure and shared sections,
   cards, multi-file operations, save/publish), then 16 (Monaco trim). Plan
   each with a read-only planner first; one branch and worktree per slice.

## Cleanup still pending

Worktrees that are merged and can be removed when Lex says done:
`native-site-editor-p5-boot-controller`, `-p5-shared-index-fix`,
`-p5-preview-selection`, `-p5-runtime-cache`, `-structure-card-editor`,
`-component-icon`, `-p5-preview-preload`. Keep `-proto-sidebar` until Lex
decides.

## Memory worth loading

- `test-scope-before-shipping.md`: fast set by default, full suites for shared
  plumbing.
- `dev-branch-preview-editor.md` and `screenshots-after-preview-push.md`:
  preview deploy and screenshot habit.
- `delegate-to-agents-to-keep-context-small.md`.
