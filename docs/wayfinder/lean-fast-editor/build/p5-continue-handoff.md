# Phase 5: continue handoff (2026-10-08)

Supersedes [p5-slices-handoff.md](p5-slices-handoff.md) as the starting point;
that file keeps the full per-slice record. Claude orchestrates; grunt subagents
build one slice per branch; Claude Opus 5.5 / medium reviews read-only through
the CLI (runner scripts: root `.scratch/p5-review/run-*-review.py`; copy the
latest one and change worktree, head and prompt).

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

`main.ts` 8,164 lines. Preview `64761767` is current. Landed this session:

| Commit | What | Gates |
| --- | --- | --- |
| `260fa94` | Slice 9, boot controller ([p5-12](p5-12-boot-controller.md)) | full native-save 708 / 85 / 0 |
| `22e84b4` | Shared-section offers wait for the text index (the 20 native-static failures were a regression from merge `b2ba723`) | native-static 40 / 13 / 0, full 708 / 85 / 0 |
| `043101e` | Slice 10, preview selection controller ([p5-13](p5-13-preview-selection-controller.md)) | full 708 / 85 / 0 |
| `44f7524` | Page Structure in-place editing (Lex designed it via a prototype; see p5-slices-handoff) | full 719 / 85 / 1 (spec fixed) |
| `7acbc17` | Preview runtime hashed under `/assets/`, immutable; 8 s ready watchdog ([p5-14](p5-14-runtime-cache.md)) | full 721 / 85 / 0; live headers verified |
| `43100c4` | Component icon is Phosphor `diamonds-four` (Lex) | structure/edit-bar specs 157 / 9 / 0 |

Baselines now: 1,092 units; full native-save 721 passed / 85 skipped / 0
failed; native-static 40 / 13 / 0; budget 346 KB of 350 KB.

## Not merged

- `build/p5-preview-preload` (`09f59c3`, worktree
  `native-site-editor-p5-preview-preload`): slice 10b, parks the preview frame
  and preloads the runtime at `nativeEngaged = true`. Measured no gain (cold
  1020 → 1030 ms, warm 630 → 634 ms): the runtime request cannot start before
  `/api/snapshot` proves the repo native, and the old code already loaded it
  then; warm loads hit the immutable cache. Lead decision: do not merge (adds
  lifecycle complexity; touches the code behind the `native-canvas:195` flake).
  Its doc `p5-15-preview-preload.md` and raw timings stay on the branch.
- `proto/structure-sidebar` (`d3df960`): the four-look Page Structure prototype.
  Keep, do not push or merge.

## Timing (median of 5, 100 ms / 20 Mbps, `tests/perf/cold-start.ts`)

Latest dev baseline on this machine (2026-10-08): cold paint about 1,020 ms,
warm about 630 ms (earlier runs measured 1,199 / 779 before the runtime cache;
the machine varies, so always measure before and after in one sitting).
Remaining levers named in reviews, unmeasured: the 300 ms font wait
(`main.ts` near the font race in `activateNativeSite`, only for pages with
fonts), the serial page/style reads after the snapshot, and the snapshot
itself. Investigate with `ASE_COLD_WATERFALL=1` before building.

## Watch list

- Flaky specs: `native-shared-link-host.spec.ts:82` (1 in about 6 runs),
  `native-canvas.spec.ts:195` (code-hover hint; 1 failure in each of two full
  runs, passes alone).
- Page Structure editor known limits (p5-slices-handoff "Page Structure
  in-place editing").

## Next actions

1. Ticket 02: waterfall the current dev build (cold and warm) and pick the
   biggest remaining gap; propose it to Lex before building.
2. Slices 11–15 of the controller plan (pages, structure and shared sections,
   cards, multi-file operations, save/publish), then 16 (Monaco trim). Plan
   each with a read-only planner first; one branch and worktree per slice.

## Cleanup still pending

Worktrees that are merged and can be removed when Lex says done:
`native-site-editor-p5-boot-controller`, `-p5-shared-index-fix`,
`-p5-preview-selection`, `-p5-runtime-cache`, `-structure-card-editor`,
`-component-icon`. Keep `-p5-preview-preload` and `-proto-sidebar` until Lex
decides.

## Memory worth loading

- `test-scope-before-shipping.md`: fast set by default, full suites for shared
  plumbing.
- `dev-branch-preview-editor.md` and `screenshots-after-preview-push.md`:
  preview deploy and screenshot habit.
- `delegate-to-agents-to-keep-context-small.md`.
