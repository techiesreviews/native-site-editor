# Phase 5 controller slices and structure rails

Continues [the review-fix handoff](p5-review-fixes-handoff.md) from 2026-10-07
15:25 Amsterdam. Claude (Opus 5.5) orchestrates; grunt subagents build slices;
Claude Opus 5.5 / medium reviews read-only through the CLI.

## Authorization and constraints

- Lex said "merge with dev and continue" (2026-10-07). `dev` work is committed
  on `dev`, pushed to `origin dev` and deployed by hand with
  `npm run deploy:preview` (the CI deploy has no `CLOUDFLARE_API_TOKEN`).
  Never `deploy:techies` or touch `main` for this work.
- Before merging a slice: diff review, Claude CLI review, check, units, touched
  browser specs and the full native-save suite on the exact head. Browser runs
  are serial on port 5216; never edit a worktree while a suite runs from it
  (Playwright imports spec files lazily).
- After each preview deploy, screenshot the change on the real starter
  (`ASE_NATIVE_SAVE_PORT=5400 ASE_NATIVE_SAVE_FIXTURE=~/Projects/native-site-editor-starter npx tsx tests/native-save/server.ts`
  from a worktree with a fresh `dist`).
- Use Node 24 from `/home/ubulex/.npm/_npx/387698761821791d/node_modules/node/bin`.
  Worktrees symlink `node_modules` from `native-site-editor-p5-review-fixes`.
  The native-static fixture lives in the root workspace's
  `.scratch/native-static-preview`; symlink it into a worktree's `.scratch` to
  run `npm run test:browser:native-static -- --port 5216 --workers=1`.

## Landed on `dev`

| Commit | What | Proof |
| --- | --- | --- |
| `759c888` | Phase 5 review-fix stack (`9d6cb00`) plus handoff docs | Full native-save 708 passed / 85 skipped / 0 failed on `9d6cb00`; byte gate 344 KB |
| `c275489` | A component's parts share its chevron column; its rail runs through the chevron | check, 1,050 units, structure specs 105 passed / 2 skipped |
| `8a02a54` | Every group has a rail through its parent's chevron: grey for elements, purple for a component's parts. Component chevrons sit in a purple ring filled with the row surface. `--depth` is now the row's visual column, set in `page-structure.ts` (parts keep their component's column; other children step in 4 px; groups carry `--rail`) | check, 1,050 units, structure specs 105 passed / 2 skipped |

Preview deploys: `f87d2d31` (review-fix stack), `7ea25f46` (`c275489`),
`0ab351bc` (`8a02a54`). Screenshots: root `.scratch/preview-shots/<version>/`.
Lex asked for: subitems further left; the line through the middle of the
chevron; grey lines for non-component groups; a purple circle around component
chevrons. Each rail shows only the nearest parent's line (continuous ancestor
lines stacked 4 px apart looked busy).

## Slice 8: code panes controller (not yet merged)

Branch `build/p5-code-panes-controller`, head `ddd8ed4` (rebased onto
`c275489`), worktree `/home/ubulex/Projects/native-site-editor-p5-code-panes`.
Moves Monaco's load gate and the code-pane resize mounting from `src/main.ts`
into `src/controllers/code-panes-controller.ts` (+4 units); `main.ts`
8,457 → 8,393 lines. `openCodeEditor`/`closeEditor`/`disposeEditor` stay in the
host (History coupling).

- On `ddd8ed4`: check, **1,054** units, full native-save **708 passed / 85
  skipped / 0 failed**. Pre-rebase `bf999bf`: build, code-pane browser specs
  (43), smoke 28, byte gate 344 KB.
- Claude review (`.scratch/p5-review/claude-code-panes/` in the root
  workspace): verified, no defects. Gaps: the master reveal/fold path needs the
  native-static group; reads-wait unit test is weak.
- Native-static group: RESULT_PENDING.

## Next actions

1. If native-static passes on `ddd8ed4`: rebase onto `dev` (`8a02a54`), merge
   (fast-forward), push, `deploy:preview`, record here.
2. Slice 9 (rest of boot), then 10 and 12–15 per
   [the controller plan](p5-controller-plan.md); one slice per branch, same
   gates.
3. Ticket 02 timing targets still miss (cold paint about 1.19 s against 1.0 s,
   warm about 0.78 s against 0.4 s); the byte gate passes at 344 KB.
