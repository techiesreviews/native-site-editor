---
title: "Fresh start: archive and remove old branches in every project, a new `dev` from `main` everywhere; TechiesTools starts over from its live version"
type: task (AFK)
status: closed
assignee: ke-90
builder: claude
blocked_by: []
---

## Goal

Lex (2026-10-31): "Let's remove the techies tools branch for the patterns etc, clean all and start fresh from main, put it on dev so we have a fresh start. Same goes for other projects." Asked to confirm:
- **TechiesTools' unsaved video-sections work:** "Attic it too".
- **Which other projects:** "Yes all of these".
- **The branch rule:** "Yes a branch can go into dev, main can only get dev".

Everything removed goes to the attic (`~/Projects/attic/<repo>/`, 30 days, `tidy restore` brings it back) first.

## Decided behaviour

- **Attic first, always.** Every branch and every piece of unsaved work is bundled into the attic before it is deleted (`git bundle` of the branch, or a WIP commit on an `attic/` branch for unsaved files, then bundled). Its entry is listed in Done.
- **TechiesTools** (`techiesreviews/TechiesTools`, public):
  - **To the attic, then deleted on GitHub:**
    - `develop` (27 changes: patterns, ten video sections, framework work, its kit setup);
    - `docs/native-static-export-adr`, `feat/71-guided-website-redesign`, `feature/section-library`;
    - `research/core-element-defaults`, `research/extra-elements-saas-marketing`;
    - `release/astro-hotfix-1031`.
    Open PRs on them are closed with a comment.
  - **The main checkout's unsaved work** (on `feat/ten-video-sections`, 3 files) goes to the attic too. The checkout ends on the new `dev`, clean.
  - **A new `dev` from `main`**, then one PR into `dev` through the kit:
    - `kit init` (`land: dev`, `release: main`);
    - remove the 64 tracked files under `.agents/skills/` (Matt Pocock's free skills; Lex chose to remove skills from the repo, and the skill guard refuses them);
    - Astro 7.1.4 → 7.3.3 (the critical security fix, as on `develop` in #93), with the lockfile from npm 11.
  - **Release `dev` → `main`** (`kit pr --release`), `kit release-check`, `npm run deploy:production`, and a live check. This is the critical fix going live under Lex's standing rule, and `dev` holds nothing else.
- **native-site-editor:**
  - **To the attic, then deleted:** all `research/*`, `prototype/*`, `build/ak-28-kit-wait-test-load`, `hotfix/dompurify-bundle`, `hotfix/dompurify-critical`.
  - **Keep `dev`** (648 changes, stage 1, waiting for the Tuesday ship) and any branch with an open PR or a running slice: `build/am-24-per-person-undo` (slice am-24 running) and `build/ke-60-actual-tag` (PR #289, ticket 88 lands it).
  - Docs that link to a removed research branch are left as they are: the attic entry name goes into Done so the content can be restored.
- **techies-reviews:** `automation/video-content-state` (60 changes) and `feat/melapress-course` (101) go to the attic, then are deleted. The checkout moves to `main` first; it has no unsaved work today.
- **camframe:** `experiment/gpui-port` (7) and `agent/float-above-windows-taskbar` (1) go to the attic, then are deleted. The checkout moves to `main`.
- **techies-playground:** the 4 `dependabot/*` branches; close their PRs with "replaced by the monthly update (kitchen 87)".
- **`dev` everywhere.** In every project in the machine's `projects.json` (agent-kit, camframe, chat, lexvd-site, native-site-editor, prompter, script, techies-playground, techies-reviews, TechiesTools):
  - create `dev` from `main` where missing;
  - set `branches.land: dev`, `branches.release: main` in `scripts/agents/kit.json`, through each project's `kit pr` into `dev` and a release to `main` so both agree.
  - **Exceptions, unchanged for now** (ticket 89 lists them for the Tuesday pack):
    - the Native Site Editor's saves to techies-reviews and lexvd-site keep going to `main`;
    - chat's backup routine stays as it is;
    - agent-kit's machine copy keeps following `main`.
- Nothing else in any project changes. Never `git stash`. Never discard work without its attic entry.

## Done when

- The attic list (repo, branch or work, entry name) is in Done.
- Every removed branch is gone on GitHub, and their PRs are closed.
- TechiesTools: `dev` = `main` + the one PR; live runs Astro 7.3.3 (version id, live check, undo command).
- `git ls-remote` per project shows `main` and `dev` and only active branches.
- The settings in every project say `dev`/`main`.

## Kit commands and evidence

Agent Kit is required for every commit (`scripts/agents/kit doctor`, `kit pr`, `kit pr --release`, `kit release-check`). `tidy --dry-run` and the attic list for the archive. This ticket's Done lands on the editor's `dev` with `scripts/agents/kit pr` (docs tier).

## Done (2026-10-31)

### Attic

Every entry is in tidy's own format (`INFO.txt`, `commits.bundle` checked with `git bundle verify` before anything was deleted, and a pinned ref `refs/tidy/attic/<entry>` in the repo), so `tidy restore <entry>` brings it back and the usual 30 days apply (all expire 2026-11-30). `tidy attic` lists all 74. A branch whose commits are all on `main` has no bundle, only the pinned ref, as tidy does it.

- **TechiesTools** (12 entries, `~/Projects/attic/TechiesTools/`):
  - `develop` at `33fb0421` → `2026-10-31-branch-develop`
  - `docs/native-static-export-adr` at `3157eeb5` → `2026-10-31-branch-docs_native-static-export-adr`
  - `feat/71-guided-website-redesign` at `46a93caf` → `2026-10-31-branch-feat_71-guided-website-redesign`
  - `feature/section-library` at `99b04c6b` → `2026-10-31-branch-feature_section-library`
  - `research/core-element-defaults` at `ad6563e9` → `2026-10-31-branch-research_core-element-defaults`
  - `research/extra-elements-saas-marketing` at `f498b5a5` → `2026-10-31-branch-research_extra-elements-saas-marketing`
  - `release/astro-hotfix-1031` at `e3fe60c7` → `2026-10-31-branch-release_astro-hotfix-1031`
  - `feat/glass-card-tool` at `1a97bd75` → `2026-10-31-branch-feat_glass-card-tool` (no bundle: every commit is on `main`; pinned ref only)
  - `feature/pattern-export-name` at `e483e6b7` → `2026-10-31-branch-feature_pattern-export-name` (no bundle: every commit is on `main`; pinned ref only)
  - `attic/ten-video-sections-unsaved` at `729b4a77` → `2026-10-31-branch-attic_ten-video-sections-unsaved`
  - `feat/ten-video-sections` at `56dfbaba` → `2026-10-31-branch-feat_ten-video-sections`
  - `hotfix/astro-critical` at `e61da93d` → `2026-10-31-branch-hotfix_astro-critical`
- **native-site-editor** (51 entries, `~/Projects/attic/native-site-editor/`):
  - `build/ak-28-kit-wait-test-load` at `7b35c62b` → `2026-10-31-branch-build_ak-28-kit-wait-test-load`
  - `hotfix/dompurify-bundle` at `ea7921b1` → `2026-10-31-branch-hotfix_dompurify-bundle`
  - `hotfix/dompurify-critical` at `944eb9e5` → `2026-10-31-branch-hotfix_dompurify-critical`
  - `prototype/am-12-typing-together-poc` at `52ea2209` → `2026-10-31-branch-prototype_am-12-typing-together-poc`
  - `prototype/am-12-typing-together-poc` at `48d224a6` → `2026-10-31-branch-prototype_am-12-typing-together-poc-2`
  - `prototype/cb-04-make-component` at `23de3d9c` → `2026-10-31-branch-prototype_cb-04-make-component` (no bundle: every commit is on `main`; pinned ref only)
  - `prototype/cb-09-add-existing-page` at `2772578a` → `2026-10-31-branch-prototype_cb-09-add-existing-page`
  - `prototype/cb-12-drag-and-drop` at `18628320` → `2026-10-31-branch-prototype_cb-12-drag-and-drop`
  - `prototype/cb-14-edit-component` at `2b192dc1` → `2026-10-31-branch-prototype_cb-14-edit-component`
  - `prototype/lf-12-project-overview` at `3a481714` → `2026-10-31-branch-prototype_lf-12-project-overview`
  - `release/clean-up-2026-10-26` at `9ac4574a` → `2026-10-31-branch-release_clean-up-2026-10-26` (no bundle: every commit is on `main`; pinned ref only)
  - `research/01-cold-start-baseline` at `944222ea` → `2026-10-31-branch-research_01-cold-start-baseline` (no bundle: every commit is on `main`; pinned ref only)
  - `research/ac-01-techies-framework` at `28857383` → `2026-10-31-branch-research_ac-01-techies-framework`
  - `research/ac-02-board-on-a-canvas` at `f0d4dbe4` → `2026-10-31-branch-research_ac-02-board-on-a-canvas`
  - `research/ac-03-toasts-and-explainers` at `3276cb74` → `2026-10-31-branch-research_ac-03-toasts-and-explainers`
  - `research/ac-04-parts-inventory` at `5f65cd3a` → `2026-10-31-branch-research_ac-04-parts-inventory`
  - `research/am-01-agents-on-own-subscriptions` at `02a554a1` → `2026-10-31-branch-research_am-01-agents-on-own-subscriptions`
  - `research/am-02-what-an-mcp-can-do` at `1a0456d4` → `2026-10-31-branch-research_am-02-what-an-mcp-can-do`
  - `research/am-03-cheapest-shared-editing` at `dc7bf0b0` → `2026-10-31-branch-research_am-03-cheapest-shared-editing`
  - `research/am-04-always-the-latest` at `965799c2` → `2026-10-31-branch-research_am-04-always-the-latest`
  - `research/cb-01-masters-and-components` at `b4086e21` → `2026-10-31-branch-research_cb-01-masters-and-components`
  - `research/cb-06-variant-discovery` at `23e1da20` → `2026-10-31-branch-research_cb-06-variant-discovery`
  - `research/cb-11-insert-drag-today` at `41afe17d` → `2026-10-31-branch-research_cb-11-insert-drag-today`
  - `research/cbf-01-architecture-review` at `4fe31db3` → `2026-10-31-branch-research_cbf-01-architecture-review`
  - `research/cbf-02-debt-and-follow-ups` at `eacf2e88` → `2026-10-31-branch-research_cbf-02-debt-and-follow-ups`
  - `research/durable-object-live-relay` at `535c19d3` → `2026-10-31-branch-research_durable-object-live-relay`
  - `research/durable-object-modern-registration` at `409b6e26` → `2026-10-31-branch-research_durable-object-modern-registration`
  - `research/durable-object-quota-baseline` at `f357a2ab` → `2026-10-31-branch-research_durable-object-quota-baseline`
  - `research/ke-02-what-each-project-needs` at `025b86b5` → `2026-10-31-branch-research_ke-02-what-each-project-needs`
  - `research/ke-03-old-kit-copies` at `5c906dca` → `2026-10-31-branch-research_ke-03-old-kit-copies`
  - `research/ke-04-how-projects-pull-the-kit` at `20dd55c8` → `2026-10-31-branch-research_ke-04-how-projects-pull-the-kit`
  - `research/ke-77-retro-check` at `1a030082` → `2026-10-31-branch-research_ke-77-retro-check`
  - `research/lf-01-browser-support` at `e1f8bd80` → `2026-10-31-branch-research_lf-01-browser-support`
  - `research/lf-02-skip-and-limits` at `192d9895` → `2026-10-31-branch-research_lf-02-skip-and-limits`
  - `research/lf-03-source-seam` at `214f0e8d` → `2026-10-31-branch-research_lf-03-source-seam`
  - `research/lf-04-agents-on-a-folder` at `d872a69a` → `2026-10-31-branch-research_lf-04-agents-on-a-folder`
  - `research/mm-01-mobbin-patterns` at `d0c211b7` → `2026-10-31-branch-research_mm-01-mobbin-patterns`
  - `research/mm-02-optimising-media` at `8842164b` → `2026-10-31-branch-research_mm-02-optimising-media`
  - `research/mm-03-responsive-crop-focus` at `87e5100b` → `2026-10-31-branch-research_mm-03-responsive-crop-focus`
  - `research/mm-04-media-code-today` at `2d97d703` → `2026-10-31-branch-research_mm-04-media-code-today`
  - `research/mm-05-images-on-sites` at `e31b6dc8` → `2026-10-31-branch-research_mm-05-images-on-sites`
  - `research/sf-01-line-today` at `2645f51b` → `2026-10-31-branch-research_sf-01-line-today`
  - `research/sq-01-spec-for-native-sites` at `dff5bb4b` → `2026-10-31-branch-research_sq-01-spec-for-native-sites`
  - `research/sq-02-geo` at `50a2fd5f` → `2026-10-31-branch-research_sq-02-geo`
  - `research/sq-03-lighthouse-today` at `a0026cb3` → `2026-10-31-branch-research_sq-03-lighthouse-today`
  - `research/ss-01-zoomable-map` at `e817b830` → `2026-10-31-branch-research_ss-01-zoomable-map`
  - `research/ss-02-structure-and-search` at `e7e3a485` → `2026-10-31-branch-research_ss-02-structure-and-search`
  - `research/ss-03-project-overview` at `edf578fb` → `2026-10-31-branch-research_ss-03-project-overview`
  - `research/st-01-panel-patterns` at `3a1b207a` → `2026-10-31-branch-research_st-01-panel-patterns`
  - `research/st-02-components-and-old-panel` at `4182a3ab` → `2026-10-31-branch-research_st-02-components-and-old-panel`
  - `research/st-03-bricks-acss-wp` at `adad1f7a` → `2026-10-31-branch-research_st-03-bricks-acss-wp`
- **techies-reviews** (2 entries, `~/Projects/attic/techies-reviews/`):
  - `automation/video-content-state` at `399a9142` → `2026-10-31-branch-automation_video-content-state`
  - `feat/melapress-course` at `0de58f02` → `2026-10-31-branch-feat_melapress-course`
- **camframe** (5 entries, `~/Projects/attic/camframe/`):
  - `experiment/gpui-port` at `bb006c48` → `2026-10-31-branch-experiment_gpui-port`
  - `agent/float-above-windows-taskbar` at `967b637f` → `2026-10-31-branch-agent_float-above-windows-taskbar`
  - `agent/camframe-windows-overlay` at `0bedcefb` → `2026-10-31-branch-agent_camframe-windows-overlay` (no bundle: every commit is on `main`; pinned ref only)
  - `agent/configurable-camera-quality` at `7d2347ff` → `2026-10-31-branch-agent_configurable-camera-quality` (no bundle: every commit is on `main`; pinned ref only)
  - `refactor/deepen-electron-modules` at `e04d2432` → `2026-10-31-branch-refactor_deepen-electron-modules` (no bundle: every commit is on `main`; pinned ref only)
- **techies-playground** (4 entries, `~/Projects/attic/techies-playground/`):
  - `dependabot/npm_and_yarn/fast-uri-3.1.9` at `f3ba3263` → `2026-10-31-branch-dependabot_npm_and_yarn_fast-uri-3.1.9`
  - `dependabot/npm_and_yarn/multi-925a388b19` at `37a2d2df` → `2026-10-31-branch-dependabot_npm_and_yarn_multi-925a388b19`
  - `dependabot/npm_and_yarn/source-map-js-1.2.2` at `84000055` → `2026-10-31-branch-dependabot_npm_and_yarn_source-map-js-1.2.2`
  - `dependabot/npm_and_yarn/vite-7.3.7` at `29da329e` → `2026-10-31-branch-dependabot_npm_and_yarn_vite-7.3.7`

The TechiesTools main checkout's unsaved work (on `feat/ten-video-sections`: 3 changed files `docs/adr/README.md`, `docs/framework/primitives.md`, `src/framework/colors/palette-generation.ts` and 2 new files `docs/adr/0023-colour-scales-never-produce-pure-black.md`, `tests/palette-generation.test.mjs`; the ticket counted 3) was committed as Lex on a local `attic/ten-video-sections-unsaved` branch (`729b4a7`) and is the entry `2026-10-31-branch-attic_ten-video-sections-unsaved`. Its `.scratch/` (kit review logs) stayed in place; `.scratch/` is now ignored there.

### Removed

- **TechiesTools:** on GitHub `develop`, `docs/native-static-export-adr`, `feat/71-guided-website-redesign`, `feature/section-library`, `research/core-element-defaults`, `research/extra-elements-saas-marketing`, `release/astro-hotfix-1031`, plus `feat/glass-card-tool` and `feature/pattern-export-name` (both already fully on `main`). PR #84 closed with a comment naming its attic entry. Local: those branches, `feat/ten-video-sections`, `hotfix/astro-critical`, the attic branch, and `hotfix/astro-critical-main` with its worktree `~/Projects/TechiesTools-astro-main` (nothing beyond the Astro raise, which `dev` holds). The main checkout is on `dev`, clean. Untouched: `build/ke-44-shared-kit` in `~/Projects/TechiesTools-ke44` (another agent's; it was based on `develop`).
- **native-site-editor:** 38 branches on GitHub (every `research/*` and `prototype/*`, `build/ak-28-kit-wait-test-load`, `hotfix/dompurify-bundle`, `hotfix/dompurify-critical`, and `release/clean-up-2026-10-26`, merged as #196). Local copies deleted too, except 14 that other agents' worktrees still have checked out (kept, their content is in the attic): `hotfix/dompurify-bundle`, `prototype/am-12-typing-together-poc`, `research/ac-01…04`, `research/am-01…04`, `research/cbf-02-debt-and-follow-ups`, `research/sq-01…03`. Kept: `dev`, `main`, `build/am-24-per-person-undo` (local only, slice running); `build/ke-60-actual-tag` merged as #289 meanwhile. Local branches outside the list stay (`hotfix/dompurify-mcp-dev`, `release/gate1-58fd637b`, `release/gate2-evidence`). Docs that link to removed research branches are unchanged; the entry names above restore them.
- **techies-reviews:** `automation/video-content-state`, `feat/melapress-course`. The checkout was clean and is on `main`.
- **camframe:** `experiment/gpui-port`, `agent/float-above-windows-taskbar`, plus `agent/camframe-windows-overlay`, `agent/configurable-camera-quality`, `refactor/deepen-electron-modules` (all three fully on `main`). The checkout had only `.scratch/` untracked and is on `main`.
- **techies-playground:** the 4 `dependabot/*` branches; PRs #3, #5, #7, #8 closed with "Replaced by the monthly update (kitchen 87)".

### TechiesTools live

- `dev` created from `main` (`d184668`). PR [#95](https://github.com/techiesreviews/TechiesTools/pull/95) into `dev`: `kit init --land dev`, the 64 files under `.agents/skills/` and `skills-lock.json` removed (deleted only), Astro 7.1.4 → 7.3.3 with the npm 11 lockfile and its guard test (the hot-fix agent's commit `31bcc21`). Review rounds found that CI and the preview still watched `develop`: `.github/workflows/deploy.yml`, `docs/operations/deployment.md` and `docs/agents/adaptive-orchestration.md` now say `dev`, `kitchen-extras.md` holds real answers, and `tests/agent-kit-branches.test.mjs` ties the kit's branches to the workflow. `RESULT: ok merged #95 622318e` (round 4 with a lead waiver for P3 notes only).
- Release [#96](https://github.com/techiesreviews/TechiesTools/pull/96) `dev` → `main`: `release-check: ok (622318e is origin/dev, nothing unsaved)`, opened, lead waiver for one P2 doc wording (fixed in [#97](https://github.com/techiesreviews/TechiesTools/pull/97), `RESULT: ok merged #97 c73781a` on `dev`, live with the next release), CI green, merged `ad78266`.
- Live: GitHub Actions deploys every push to `main` (`docs/operations/deployment.md`; `npm run deploy:production` is the escape hatch for when Actions is down, so it was not run a second time). Run 41216997504: 273/273 tests, build, deploy; `Current Version ID: 520d5ad7-237e-43b0-a023-4f912244b438`. `kit release-check` on `origin/main`: `RESULT: ok release-check ad78266 is origin/main, nothing unsaved`. The lockfile on `main` locks Astro 7.3.3. https://techies.tools/, `/apps`, `/apps/framework`, `/apps/glass-card` answer 200; preview.techies.tools answers 200.
- Undo: `npx wrangler rollback 725c6db7-c71d-4658-9529-0431c5189d6b --name techies-tools` (the version live before, 2026-10-28).

### `dev` everywhere

`dev` was created from `main` in agent-kit, camframe, chat, lexvd-site, prompter, script and techies-playground; techies-reviews' existing `dev` (0 ahead, 63 behind) was fast-forwarded to `main`. Each project then landed `branches.land: dev`, `branches.release: main` (and `ci: dev` where `ci` was set) with docs to match through its own `kit pr`, and released it with `kit pr --release --base main` (kit refuses `--release` without `--base main`; the docs now say so). Every release ended with `kit release-check` on `origin/main` → `RESULT: ok`.

| Project | Into `dev` | Release into `main` | Notes |
| --- | --- | --- | --- |
| TechiesTools | #95 `622318e` | #96 `ad78266` | live, above |
| agent-kit | #17 `02ac78b` | #19 `b6b2e0d` | CI runs for PRs into `dev` and `main`; machines keep following `main` (exception); no waiver |
| camframe | #26 `d605f6b` | #28 `785d5ff` | no deploy; no `v*` tag made |
| chat | #4 `c9192c5` | #5 `48411db` | backup routine unchanged (exception) |
| lexvd-site | #4 `9c79abe` | #6 `a8f60ae` | Workers Builds deployed, version 7e94ad43 → 0410d6d5; editor saves stay on `main` (exception) with a written sync rule back to `dev` |
| prompter | #2 `45005d4` | #4 `609501e` | `kit specs --affected` and CI follow `dev`; no deploy |
| script | #3 `949205c`, #6 `57c8613` | #5 `b9a072a` | #6: `kit deploy` starts with `kit release-check` (release review P1); `kit deploy` not run |
| techies-playground | #11 `6d70fe2` | #13 `e6f6a54` | WordPress sync now opens its PRs into `dev`; deploy run 41219819268 green, play.techies.tools 200 |
| techies-reviews | #14 `561640e` | #16 `d700837` | editor saves stay on `main` (exception) with a sync rule; GitHub 502 during the merge, so no deploy ran for `d700837` (only unserved files changed); the next push to `main` deployed at 17:39 |
| native-site-editor | already | (Tuesday ship) | `origin/dev` kit.json: `land dev`, `release main`, `ci dev`; `origin/main` has no kit.json until stage 1 ships |

Waivers (all `ke-lead`, P2/P3 or validation gaps only, after three rounds or on a release of already-reviewed content) are named on each PR's RESULT line. The second look was skipped on every run: Grok's weekly budget was used up (8/8 in 2026-W44) and the free OpenCode model gave no session within 300 s.

### `git ls-remote --heads` per project (after)

- TechiesTools: `dev`, `main`
- agent-kit: `dev`, `main`
- camframe: `dev`, `main`
- chat: `dev`, `main`
- lexvd-site: `dev`, `main`
- native-site-editor: `dev`, `main`
- prompter: `dev`, `main`, `shared-kit` (3 commits not on `main`, from 2026-10-30, no PR, with its own worktree `~/Projects/techies-prompter-shared-kit`; not in the ticket, kept)
- script: `dev`, `main`
- techies-playground: `dev`, `main`
- techies-reviews: `dev`, `main`

### Open for the lead

- **`main` ahead of `dev`:** while this ran, other agents landed straight on `main` with the old settings: "Kit setup: add what kit init writes today" in lexvd-site, prompter, script (#4) and techies-reviews, and 9 commits in agent-kit (ke-91 and others). Each needs a branch from `origin/main` landed on `dev` (`kit pr`). The editor's `main` holds its DOMPurify hot fix, as before.
- **idea-board** is in the machine's `projects.json` but not in this ticket's list: not touched (it lands on `main`, PR #2 open).
- `kit wait ci --pr` fails on a repo with no PR checks (chat: "Unexpected end of JSON input"; lexvd-site and techies-reviews: no answer); kit bug for ticket 89.
- The push guard does not stop a raw push to `dev`, and in techies-reviews a push to `dev` (or a manual workflow run) deploys the preview.
- prompter's extras say "a clean checkout of `origin/dev`" where `kit pr` needs a new branch made from `origin/dev`.
- techies-playground's change record `docs/changes/2026-10-31-land-on-dev.md` stays in progress until the daily sync (06:17 UTC) opens a PR into `dev`; the token cannot start the workflow by hand (403).
- `kit doctor` warns in most projects that 3 hook entries a newer kit adds (brief-guard, stop-guard) are missing: `kit init --all`.
