# Copying the kitchen to Lex's other projects

Research for [ticket 70](../build/tickets/70-copy-the-kitchen-plan.md), 2026-10-25. Read-only: it looked at this repo's kit on the branch from `origin/dev` `1b3f700e1`, at Lex's other folders in `~/Projects`, at `~/Projects/chat/memory/projects/local-project-inventory.md`, `~/Projects/chat/memory/project-notes/README.md` and at the `lex-coding` skill. Nothing was copied or changed outside this repo.

## In short

- **Most of the kit is not tied to the editor.** 18 of the 23 commands, `tickets.mjs` and the four hooks do the same job in any project. What ties them to the editor is a short list of hard-coded values: the main folder `/home/ubulex/Projects/native-site-editor`, the `native-site-editor-dev` checkout and its shared `node_modules`, the `dev` branch, `npm run check`/`npm test`/`npm run lint`, `tests/*.test.ts`, the `src/` paths that count as visible, and the preview address.
- **Copies already drift.** `chat`, `techies-playground` and `techies-reviews` each got a hand copy of the kit around 2026-10-17 (5–7 commands, own adapters such as `project-kit.mjs` and `static-kit.mjs`). Since then this repo's kit gained 127 commits on `origin/dev`; none reached them. Their `kit-lib.mjs` differs from ours by 299 lines, `doctor` by 150. None of them has the hooks (`.claude/settings.json` has no `run.sh`, no `.codex/hooks.json`), `tickets.mjs`, `slice`, `pr`, `next` or the kitchen rulebook. The chat copy is not even committed.
- **Recommendation: one shared kit that every project pulls, with a small `kit init` to set a project up.** The neutral commands live in one place; each project keeps only its own commands and one settings file. A fix is made once and reaches every project on its next update. A template repo or a copy-and-adapt `kit init` would repeat what already happened to the three copies.

## Every kit command: neutral or the editor's own

"Neutral" means the command's job makes sense in any of Lex's code projects; its assumptions are values to move into a project settings file. "Own" means the job itself is about this editor (its browser, its bundle, its preview site, its screens).

| Command | Kind | What it assumes today |
| --- | --- | --- |
| `bg` | neutral | job records under `.scratch/kit-jobs/` of the current folder; Node ≥ 24, which the `kit` front door requires for every command (`kit_node` in `kit-lib.sh`) |
| `wait` | neutral | `gh` signed in for `wait ci`; CI branch defaults to `dev` |
| `version` | neutral | none beyond git and Node |
| `doctor` | neutral, with project checks | refuses the main and `dev` checkouts; base `origin/dev`; hooks in `.claude/settings.json` and `.codex/hooks.json`; `node_modules` from `native-site-editor-dev`; Grok login check (optional) |
| `review` | neutral | base `origin/dev`; `CODING_STANDARDS.md` in the brief (`review-brief.mjs`); `claude`, `codex` or `grok` CLI; weekly GPT/Grok budget in the main folder's `.scratch/review-budget.json`, so **each project would count Sol separately although Lex's limit is one per account** |
| `fix` | neutral | the builder's CLI; `npm run lint` in the brief; `.scratch/reviews`, `.scratch/kit-fix` |
| `slice` | neutral, with project steps | `npm run check`; `docs/agents/features.md`; calls `kit ux` for visible changes; `kit pr` into `dev` |
| `pr` | neutral, with project steps | `gh`; base `dev`; tiers from `pr-tier.mjs` (`docs/`, `tests/`, `fixtures/`, `.css`, visible `src/` paths); `npm run check`, `npm test`, `npm run lint`, `npm run test:kit-clean`; three docs-guard tests by name |
| `unit` | neutral, with project runner | `tsx --test` on `tests/*.test.ts` (`unit.sh`); `--affected` follows relative imports from `specs-affected.mjs`; base `origin/dev` |
| `status` | neutral, with project row | `docs/wayfinder/`; `gh`; base `dev`; the live preview row checks `https://preview-editor.techies.tools` |
| `next` | neutral | a clean `native-site-editor-dev` checkout on `dev`; `docs/wayfinder/<map>/build/README.md`; the builder table in `docs/agents/kitchen.md`; `src/main.ts` as the one file two slices may share |
| `heartbeat` | neutral | `native-site-editor-dev`; `.scratch/kit-slice`, `.scratch/kit-jobs`; T3's 30-minute schedule |
| `score` | neutral | `docs/wayfinder/` maps; records in the main folder's `.scratch/scoreboard/` |
| `feedback` | neutral | `docs/wayfinder/<map>/build/` feedback logs |
| `card` | neutral | `~/Projects/chat/memory/project-notes/`; the project's slug from its folder (`context-card.mjs` already knows other projects' rows) |
| `learn` | neutral | `~/Projects/chat/memory/corrections/`; default slug `native-site-editor`; writes rules into `docs/agents/ux-rulebook.md` and `docs/agents/guardrails.md` |
| `sweep` | neutral, with project numbers | `src/main.ts` line count; `docs/work/tech-debt/issues`; `npm test`; `.scratch/pr`, `.scratch/unit`, `.scratch/kit-specs` |
| `deps` | neutral, if projects share one `node_modules` | the shared `node_modules` in `native-site-editor-dev` (`deps-check.mjs`) |
| `tickets.mjs` | neutral | `docs/wayfinder/<map>/tickets/*.md` and build feedback logs |
| hooks (`bash-guard`, `agent-cap`, `session-env`, `context-card`) | neutral | `jq`; `CLAUDE_PROJECT_DIR` or the git top; `bash-guard` knows `vite`, `http.server` and `playwright` as long-running servers |
| `shots` | own | the editor's named screens (`shots.config.ts`), the starter at `~/Projects/native-site-editor-starter` |
| `specs` | own | the editor's Playwright specs, fixtures, the port pool (`port.sh`) and `specs-affected.mjs`'s map from `src/` to specs |
| `size` | own | the editor's boot bundle and byte budget, `npm run build` |
| `preview` | own | `wrangler` deploy of `origin/dev` to `preview-editor.techies.tools` |
| `ux` | own tries, neutral frame | the frame (feature list, scripted checks, one reviewer, small bundle) fits any visible project; the tries and checks name editor files (`src/page-builder/*`, `src/theme.css`) |

Helpers outside `kit.d` follow the same split. Neutral: `kit-lib.sh`, `kit-lib.mjs`, `agent-run.mjs`/`agent.sh`, `review-findings.mjs`, `review-brief.mjs`, `score-page.mjs`, `worktrees.mjs` (protects the `native-site-editor-dev` checkout by path), `reap.sh`, `ci-status.sh`, `ci-summary.mjs`, `sol.sh`. Own: `worktree.sh` (names worktrees `native-site-editor-<branch>`, links the editor's preview cache), `land.sh`, `full-suite.sh`, `specs-digest.mjs`, `durable-*.mjs`, `deploy-preview.sh`, `shots.sh`, `port*.sh`. Env names start with `ASE_` (from the old Astro site editor); harmless, but they read as editor-only.

### Values a shared kit would read from a project settings file

The same handful repeat across commands, so one small file per project covers them. This list summarises the table; the settings-file sketch in ticket 04 reads the table too.

- main folder and the clean "dev" checkout (`kit-lib.sh` `kit_main_root`, `kit-lib.mjs` `kitMainRoot`, `next`/`heartbeat` `KIT_DEV_ROOT`, `worktree.sh`, the protected paths in `worktrees.mjs`);
- the branch work lands on (`dev` here; most other projects only have `main`);
- the check, unit and lint commands, and where unit tests live; extra `pr` checks (`npm run test:kit-clean`, the docs-guard tests in `pr-tier.mjs`);
- which paths count as docs, tests, CSS and visible (`pr-tier.mjs`);
- the preview address, if any (`status`), and the CI branch `wait ci` watches by default;
- the one file two slices may share, if any (`src/main.ts` in `next`; `sweep` counts its lines);
- the feature list (`docs/agents/features.md` in `slice`, `ux`, `pr-tier.mjs`) and the tech-debt folder (`docs/work/tech-debt/issues` in `sweep`);
- the shared `node_modules`, if any (`deps`, `doctor`, `worktree.sh`);
- the slug in Lex's chat memory (`learn`, `card`), which `context-card.mjs` can already work out from the folder.

The rulebook and docs split the same way. `docs/agents/kitchen.md`, `runner.md`, `issue-tracker.md`, `triage-labels.md`, `guardrails.md` (its hook part), `agent-scripts.md` (the neutral commands) and `routines/` describe the kitchen itself. `code-map.md`, `features.md`, `ux-rulebook.md`, `local-testing.md`, `github-settings.md` and `domain.md` hold this editor's facts; another project needs its own version of each.

## Lex's other projects today

From the inventory, the project-notes map and the folders (2026-10-25):

| Project | Last commit | Kit today | Tests in `package.json` | Base branch |
| --- | --- | --- | --- | --- |
| `techies-reviews` (Lex's site) | 2026-10-19 | old copy: doctor, review, shots, size, specs, version, wait; `static-kit.mjs` | no `package.json` | `dev` exists |
| `techies-playground` | 2026-10-17 | old copy: build, doctor, review, specs, version, wait; `project-kit.mjs` | `test` | `main` |
| `chat` (memory and routines) | 2026-09-01 | old copy, not committed: doctor, review, specs, video, wait | no `package.json` | `main` |
| `creator-studio-poc` (+ `creator-studio-xcloud` worktree, 2026-10-23) | 2026-10-13 | none | `test`, `test:ui` | `dev` exists |
| `TechiesTools` | 2026-10-11 | none | `check`, `test` | `main` |
| `camframe` | 2026-10-13 | none | `test`, `test:electron` | `main` |
| `astro-live-builder` | 2026-10-16 | none; no remote | `check`, `test:smoke`, … | `master` |
| `native-site-editor-starter`, `lexvd-site`, `dogsfitandfun` | 2026-10-02 to 10-15 | none | no `package.json` (static sites) | `main` |
| `youtube-scheduler-poc` | 2026-09-10 | none | `test` | `main` |
| `tidy`, `web-components-lab` | — | none; no remote or no git | — | — |

The inventory warns that a folder does not show priority or use; which projects matter is Lex's call.

**The rule already reaches every project, the tool does not.** `lex-coding` requires Agent Kit "in every project and nested folder" and tells agents to inspect the original kit with `git -C /home/ubulex/Projects/native-site-editor show origin/dev:docs/agents/agent-scripts.md` and to use "a compatible project-local kit"; it names "fixtures, budgets, ports, and deployment targets" as project-specific integration. In practice that sentence produced the three drifting hand copies. The software-factory decisions also assume a shared kit: the context card "goes into the shared Agent Kit so every project gets it" ([ticket 10](../tickets/10-grill-central-memory.md#resolution-2026-10-22)).

## Three ways to copy it

| | Template repo | Shared kit that projects pull | `kit init` that copies and adapts |
| --- | --- | --- | --- |
| What it is | a repo with the kit, rulebook and docs stubs; new projects start from it | the neutral kit lives in one place; each project keeps its own commands and one settings file and pulls the shared part | a command that copies the neutral kit into a project and rewrites the editor values for it |
| Starting a project | easy for a new project; existing projects (all of Lex's) must copy by hand | `kit init` writes the settings file, hooks and docs stubs, then the project pulls the shared part | one command |
| How a fix reaches every project | it doesn't: each project is patched by hand | once: fix it in the shared kit, each project gets it on its next update | only if `kit init` is rerun and merged over local edits in every project |
| Updates for Lex | none; projects stay frozen | one update command per project, or the weekly sweep lists projects that are behind | rerun per project, sort out clashes |
| Risk of drift | high: this is how the three copies drifted | low: shared files are not edited in the project; `doctor` can check they match a released version | medium to high: local edits to copied files are allowed, then block reruns |
| Risk of one fix breaking all | none | real: a bad shared change reaches every project; pin a version per project and update on purpose | low |
| Project-specific parts (`specs`, `shots`, previews) | written per project | written per project, beside the shared kit | written per project |

## Recommendation

**The shared kit that every project pulls, with `kit init` only to set a project up.** It is the only way where a fix to `review`, `pr` or `slice` reaches Lex's other projects without hand work, which is the problem the three old copies show. The risk that one bad change breaks every project is handled by pinning a version per project and updating on purpose, with `doctor` reporting how far behind a project is.

What has to be true first, and becomes tickets on the new map:

1. The hard-coded editor values above move into one project settings file read by the shared kit (this repo becomes the first project to use it, so the editor keeps working the same way).
2. A way to pull the shared kit that works in worktrees, in GitHub Actions and with both hooks files; the choice between a vendored copy with `kit update`, a git submodule or subtree, or a package is open.
3. The neutral docs (rulebook stations, runner, issue tracker, hooks) become shared with a per-project extras file, as `docs/agents/runner-extras-template.md` already does for build slices.
4. The Sol review budget is counted once for the machine, not once per project.

Planning continues on [the kitchen-everywhere map](../../kitchen-everywhere/map.md).
