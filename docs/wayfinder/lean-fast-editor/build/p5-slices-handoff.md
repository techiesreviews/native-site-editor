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
| `86f3f4b` | Per Lex's mockup: the component's own chevron stays plain; a part with its own chevron sits on the purple rail inside a same-purple ring (box-shadow, so the 14 px toggle and rail centring stay) | structure specs 105 passed / 2 skipped |
| `d669e07` | Slice 8, code panes controller (below), fast-forwarded onto `86f3f4b` | check, 1,054 units, smoke 28 on `d669e07` |
| `4b08251` | Every chevron in a 2 px ring of its line's exact colour (purple for components and parts, grey otherwise), no fill; rails stop at rings. Fade test samples the plain colour at x = 2 px, left of the ring | structure specs, native-structure-compact 33/33 |
| `a5c4fe7` | Redesign after Lex found the rings cluttered (Mobbin: Figma, Rive, MagicPath): 8 px per level; 10 px 1 px ring inside each expandable chevron; one 1 px guide per group from under the parent's ring; purple for components, grey otherwise; parts no longer share the component's column | check, 1,054 units, structure specs 105 passed / 2 skipped |
| `1f080f3` | Lex disliked the rings and guides: Page Structure restored to its `ddd8ed4` (= `c275489`) look. Parts share the component's chevron column, purple rail through that chevron, 4 px per level, no rings, no grey guides | check, structure specs 105 passed / 2 skipped |
| `043101e` | Slice 10, preview selection controller ([p5-13](p5-13-preview-selection-controller.md)): selection dispatch, refusals, reveal, replay, source intent and selection waiters moved to `src/controllers/preview-selection-controller.ts`; `main.ts` 8,269 → 8,162. Opus review: no defects | check, 1,084 units, focused 152, smoke 32, native-static 40/13/0 (twice; one earlier run 39/1/13, `native-shared-link-host:82`, then 5 passes), full native-save 708 / 85 / 0, budget 345 KB |
| `260fa94` + `d0e98ca` | Slice 9, boot controller (below) | check, 1,067 units, boot-focused 69, smoke 32, full native-save 708 passed / 85 skipped / 0 failed; budget 345 KB |

Preview deploys: `f87d2d31` (review-fix stack), `7ea25f46` (`c275489`),
`0ab351bc` (`8a02a54`), `a4f4d1a9` (`d669e07`), `4ca6cf7d` (`4b08251`), `9f95d45f` (`a5c4fe7`, guide redesign), `9211e120` (`1f080f3`, restored look), `de28abae` (`d0e98ca`, slice 9), `72f7e692` (`d2d9f6e`, shared-index fix), `3e8e9915` (`043101e`, slice 10), `88bd8546` (`44f7524`, Page Structure in-place editing), `5c9990a1` (`7acbc17`, hashed runtime, current). Screenshots: root `.scratch/preview-shots/<version>/`.
Lex asked for: subitems further left; the line through the middle of the
chevron; grey lines for non-component groups; then a mockup: plain component
chevron, ringed chevrons only for parts sitting on the purple rail. Each rail shows only the nearest parent's line (continuous ancestor
lines stacked 4 px apart looked busy).

## Slice 8: code panes controller (merged as `d669e07`)

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
- Native-static group on `ddd8ed4`: 20 passed, 20 failed, 13 skipped. The
  same group on its parent `c275489` fails the identical 20 (shared-authoring,
  shared-link and shared-files lifecycle specs), so these predate slice 8;
  probably drift in the root `.scratch/native-static-preview` fixture. All
  master Code reveal/fold specs pass. Logs: slice 8 worktree
  `.scratch/p5-review/code-panes-ddd8-native-static.log`, root
  `.scratch/p5-review/baseline-c275489-native-static.log`. Investigating those
  20 is open work.

## Slice 9: boot controller (merged as `260fa94`, docs `d0e98ca`)

Branch `build/p5-boot-controller`, worktree
`/home/ubulex/Projects/native-site-editor-p5-boot-controller`. `start()`, the
drafts promise, install return, auto sign-in, repository list
fetch/ensure/recover and the workspace-state flags moved to
`src/controllers/boot-controller.ts`; pure `planRepositoryOpen` came out of
`loadRepositories`. Host keeps generation bumps, `info`, `repositories`,
`chooseRepository`, `loadSnapshot`. `main.ts` 8,393 → 8,261 lines. Details and
gates: [p5-12-boot-controller.md](p5-12-boot-controller.md). Claude Opus 5.5
review verified, no defects.

## The 20 native-static failures: product regression

Not fixture drift. The fixture is `git archive 6a9ca44` of the starter minus
`.editor/`, as the specs expect; `64e42a8` passes with it. Bisect: first bad
commit is the merge `b2ba723` (draft store `926926a` × dev `2ad8600`, both
pass). 4g (`dcf85bb`) reads only the open page before first paint; until the
text index arrives `nativeSources()` gives `""` for other pages, and
`nativeSharedFieldsRevision()` keys on those sources. When the index lands the
revision moves, so Save shared / linked Edit are refused ("The page or its
shared files changed. Select the element again."). A user acting within about
a second of load hits it too. Logs: root `.scratch/p5-review/nsfix/`.

Fixed on `build/p5-shared-index-fix` (`101f2f6` + `22e84b4`, fast-forwarded
onto dev): `nativeSharedRoot` and `nativeLinkedAncestor` offer nothing until
`nativeTextIndexed`; the flag is part of `nativeSharedFieldsRevision`'s key,
cleared at the start of `activateNativeSite`, and Structure repaints when the
index lands. Nothing reads the index early (first paint unchanged). Gates on
`22e84b4`: check, 1,067 units, native-static 40 passed / 13 skipped / 0 failed,
shared-authoring 9, shared-structure 4, full native-save 708 / 85 / 0, budget
344 KB. Two Opus reviews (root `.scratch/p5-review/claude-shared-index-fix*/`):
the first found a skipped repaint and an early index read, both fixed.
Known limit: after Save to GitHub the index is read again; until it lands,
shared actions on rows already drawn are refused ("changed, select again").
Not covered by a spec: a site read whole at boot (index lands with identical
sources).

## Page Structure in-place editing (merged as `44f7524`)

Lex compared four looks on a prototype (`proto/structure-sidebar`, `d3df960`,
not pushed: Current, Layers, Outline, Cards) and kept the Current tree with
the Cards edit block. Branch `build/structure-card-editor`, 7 commits:

- A row's text is edited in place: first click selects; a second click,
  double-click, Enter, F2 or the pencil edits. No purple while editing; a ✓
  ("Done") commits; Escape restores everything and leaves no undo entry. One
  session per row edit spans the row text and the attached card's fields (URL,
  image) as one undo group.
- Fields are `<textarea rows="1">` with `field-sizing: content` (JS sizing only
  without support). Shift+Enter inserts `<br>` in phrasing elements; only the
  element's own `<br>`s are line boundaries; rewrites that would split tags are
  refused.
- Typing patches the preview element's text directly (`patch-text` runtime
  message: text nodes and `<br>` only, never HTML), 3–15 ms per key; the full
  source/draft update follows 150 ms after typing pauses. A patch that ends
  without a confirmed write forces a render from the sources.
- URL suggestions: own popover list (`field-suggestions.ts`) anchored under the
  field, title over muted path; the edit bar's link list uses the same two-line
  rows. Editing code, suggestions and the shared form load on demand.

Gates: check, 1,092 units, targeted structure/edit-bar/lazy-panels/shared set
169 passed / 27 skipped / 0 failed; full native-save on `2036281` 719 passed /
85 skipped / 1 failed (`native-routing.spec` asserted the old one-line option
text; fixed in `b58ee4d`, 4/4; product code unchanged after the full run).
Budget 345.89 KB (dev 345.30). Three Opus reviews
(root `.scratch/p5-review/claude-structure-card-editor{,-2,-3}/`): defects
found in the first two were fixed; the third found none. Known limits: a
change to an unrelated file mid-typing can briefly flicker the typed text
until the next write; two edit-bar suggestions with the same title can refocus
the first; `<br>` allowance does not list SVG/MathML or obsolete raw-text
elements; the browser specs for live patching use a stub, not the real
preview runtime.

## Preview runtime cached long-term (merged as `7acbc17`)

Lex approved long-term caching. The runtime moved to
`src/components/native-preview-runtime.js` and is referenced as
`new URL(..., import.meta.url)`, so Vite emits it verbatim (the budget step
asserts byte identity) under a hashed `/assets/` URL, covered by the immutable
rule. `/native-preview-runtime.js` is gone. A tab opened before a deploy that
asks for an old hash gets no `ready`: an 8 s watchdog hands that to chunk
recovery (spec `native-runtime-recovery`). Timing (median of 5, 100 ms /
20 Mbps): warm paint 779 → 671 ms, cold 1199 → 1210 ms (noise). Gates on
`7acbc17`: check, 1,092 units, budget 346 KB, smoke 32, native-static
40/13/0, full native-save 721 / 85 / 0. Opus review: the 404 blank-preview
defect, fixed by the watchdog. Details: [p5-14](p5-14-runtime-cache.md).

## Next actions

1. Slice 10b (attach the preview frame early, ticket 02): plan done (preload at
   `nativeEngaged = true`, park instead of remove, reload in place); re-arm the
   ready watchdog on every frame reload. Watch `native-shared-link-host:82`
   (one unexplained failure).
2. Slices 11–15 per
   [the controller plan](p5-controller-plan.md); one slice per branch, same
   gates.
3. Ticket 02 timing targets still miss (cold paint about 1.19 s against 1.0 s,
   warm about 0.78 s against 0.4 s); the byte gate passes at 344 KB.
