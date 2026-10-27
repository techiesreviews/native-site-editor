---
title: The editor values slice 11 left in shared code
type: task (AFK)
status: closed
assignee: ke-25
builder: claude
blocked_by: [14-settings-for-other-projects, 18-full-follow-ups]
---

## Goal

[Ticket 11](11-project-settings-file.md#done-2026-10-27) moved this editor's values into `scripts/agents/kit.json`, but its Done lists values still written into shared code, and Claude's PR review (two P2s, evidence `.scratch/reviews/build/ke-11-project-settings-file/20261027T073718Z` in the main checkout) asks for them to go; Grok's second look (P2, evidence `.scratch/reviews/review/ke11-second-look/20261027T080225Z` in the main checkout) found one more in `kit next`. In another project these break or mislead: a CSS-only PR fails `kit pr` on the missing `scripts/check-colours.mjs`, `checks.extra` runs only when `scripts/agents/**` changes, and `worktrees.sh` stops protecting the dev worktree of a project that lands on `main`.

## Decided behaviour

- **The colour check is a setting (P2, `kit.d/pr:235`):** `kit pr`'s `colours` step reads `checks.css` (this editor: `node scripts/check-colours.mjs`). Unset, the css tier logs `colours: skipped (no checks.css in scripts/agents/kit.json)`, like the other missing checks.
- **Kit and unit-test patterns are settings (P2, `pr-tier.mjs:64`):** `classify`'s `cleanGuard` (`^scripts/agents/`, `^tests/kit-.*\.test\.ts$`) and `unitTest` (`^tests/[^/]+\.test\.ts$`) come from `paths` (for example `paths.kit` and `paths.unitTests`), with this editor's patterns in its `kit.json`. A missing key turns its feature off with a plain line.
- **`kit pr`'s other editor bits:** the folder it reads for focused unit files (`kit.d/pr:224`, `tests`) follows the same unit-test setting; the "CI still runs check, unit tests, lint and smoke browser tests; no Sol review" line (`kit.d/pr:262`) names only the checks the settings file sets and drops "no Sol review".
- **`checks.extra` as a string (P3, `kit.d/pr:234`):** a string is taken as a one-item list; anything else that is not a list of strings fails with `checks.extra must be a list of commands`. Today a string is dropped and logged as "no checks.extra", which is false.
- **`worktrees.mjs` (lines 71, 121, 124, 155):** the protected dev worktree comes from `kitDevRoot()` (not the literal `native-site-editor-dev` or `/home/ubulex/...`), the protected branch and merge targets from `kitBranch("land")` and `kitBranch("release")`, and the closing hint names those branches.
- **`kit learn`:** `defaultSlug` (line 15) reads `project`; line 271 reads the `maps` folder instead of `join(root, "docs/wayfinder")`, and with no `maps` it skips the logs with a plain line.
- **`kit next` running slices (P2, Grok, `kit.d/next:183`):** `runningSlices` cuts the map name off `settings.maps` the way `ticketKey` does, not with `/docs\/wayfinder\/([^/]+)\//`. Today any other `maps` value leaves `ticket.map` empty, so a running `runs_alone` slice stops blocking its map (line 231).
- **`kit slice` (line 42):** refuses `kitBranch("land")` and `kitBranch("release")` instead of the literal `dev` and `main`.
- **Runner guide (P3, `docs/agents/runner.md:73`):** the visible paths are `paths.visible` and `featureList` in `scripts/agents/kit.json`, not `pr-tier.mjs`.
- **This editor works the same:** its `kit.json` gains the new keys with today's values; `kit pr --dry-run` on a CSS-only and on a kit change plans the same steps as before.

## Files

- `scripts/agents/kit.d/pr`, `scripts/agents/pr-tier.mjs`, `scripts/agents/kit.json`
- `scripts/agents/worktrees.mjs`, `scripts/agents/kit.d/learn`, `scripts/agents/kit.d/slice`, `scripts/agents/kit.d/next`
- `tests/kit-pr.test.ts`, `tests/kit-settings.test.ts`, `tests/kit-learn.test.ts`, `tests/kit-slice.test.ts`, `tests/kit-next.test.ts`, `tests/agent-worktrees.test.ts`
- `docs/agents/agent-scripts.md` (the new keys), `docs/agents/runner.md` (line 73)

## Done when

- Tests prove: no `checks.css` skips the colour step with its line; `paths.kit`/`paths.unitTests` drive `cleanGuard` and the focused unit files in a temp repo with other folders; a string `checks.extra` runs; a bad `checks.extra` fails with its line; `worktrees.sh` protects the `devRoot` worktree and the land branch of a `land: main` repo; `kit learn` uses `project` and `maps`; `kit slice` refuses a `land: main` repo's `main`.
- Grok's gap: `kit next` in a temp repo whose `maps` is not `docs/wayfinder`, with one running slice and an open `runs_alone` ticket in that map, prints `waits: … runs alone`, not `next:`.
- Validation gap from the review: in the `prod` repo of "kit pr pairs --release…", `git switch -c prod` and `pr --dry-run` gives `RESULT: fail guards: refusing branch prod`.
- `grep -rn "origin/dev\|native-site-editor\|check-colours" scripts/agents/kit.d scripts/agents/*.mjs scripts/agents/*.sh` finds only `kit.json`, the editor's own commands and comments, apart from `kit.d/ux`, which is not in this ticket's Files (follow-up in Done).
- `scripts/agents/kit unit tests/kit*.test.ts` green; `kit pr --dry-run` on this editor plans what it planned before.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only; touches shared plumbing, so `kit pr` runs the full kit test set.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke25 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/25-editor-values-left-after-11.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke25 --timeout 2h`. While building: `scripts/agents/kit unit --affected`, then `scripts/agents/kit unit tests/kit*.test.ts`.
- Second look: as the README says.
- Report: unit `RESULT:` lines, the `grep` output, before-and-after `kit pr --dry-run` plans, review decisions, PR and merge SHA.

## Done (2026-10-27)

- `kit pr`'s colour step runs `checks.css` (this editor: `node scripts/check-colours.mjs`); without it the css tier prints `colours: skipped (no checks.css in scripts/agents/kit.json)`.
- `paths.kit` decides when `checks.extra` runs and `paths.unitTests` which tracked files are unit tests for the focused run, in any folder. Without `paths.unitTests` the step prints `unit: skipped (no paths.unitTests …)`; without `paths.kit` a full-tier PR with `checks.extra` prints `kit-clean: skipped (no paths.kit …)`.
- `checks.extra` may be one string; anything but a non-blank string or a list of non-blank strings fails with `RESULT: fail guards: checks.extra must be a list of commands`.
- The PR body's CI line names only the checks the settings set (`CI still runs check, unit tests, lint and browser tests` here) and no longer says "no Sol review".
- `worktrees.sh` protects the `devRoot` worktree and the land and release branches, reads merge state from `origin/<land>` and `origin/<release>`, and its closing hint names them. It lists this editor's dev checkout and hint as before. Without readable settings it still lists, prints the problem, shows no merge state and refuses `--prune`.
- `kit learn` takes its default slug from `project` and its feedback logs from `maps`; without `maps` it prints `feedback: skipped (no maps in scripts/agents/kit.json)`. It needs a readable settings file, even with `--project`, and its usage says so.
- `kit next` takes a running slice's map from the `maps` folder, so a `runs_alone` ticket waits in a project whose maps are not `docs/wayfinder`. A running ticket keys by its path inside the worktree that holds it, and its map is the folder after a leading maps folder, so `myplans/` is not `plans/` and a dev root under a folder named like `maps` still names the right map.
- `kit slice` refuses the land and release branches from the settings (the message names them, e.g. `not dev, main or detached HEAD`), and stops with the settings problem before any phase when the settings cannot be read.
- This editor's `kit.json` gains `checks.css`, `paths.kit` and `paths.unitTests` with today's values. Its css, kit, tests and docs plans and focused unit files are the same as before (old and new `pr-tier.mjs` compared on this checkout).
- Docs: the new keys in `docs/agents/agent-scripts.md`; `docs/agents/runner.md` names `paths.visible` and `featureList`.
- Tests: kit-pr (a PR workflow with no checks set gives `CI still runs its workflows`; a project's own `checks.css` command runs instead of `check-colours.mjs`; `unit.docsGuards` without `paths.unitTests` skips the docs tier's unit step with its line; no `checks.css`, `paths.kit` and a string `checks.extra` in a repo with `tools/kit/` and `spec/`, focused files from `spec/`, missing keys, bad `checks.extra`), kit-settings (`prod` branch refused), agent-worktrees (`devRoot` and the land branch of a `land: main` repo protected, `dev` not; `land: dev` with `release: main` protects both and names both targets; no settings lists and refuses `--prune`), kit-learn (`project` and `maps`; each test root now has a settings file), kit-slice (`land: main` refuses `main`; missing or incomplete settings stop on `dev` with no phase run; its fixture now commits minimal settings by default), kit-next (maps `plans`, a running slice holds a `runs_alone` ticket; one under `myplans/` does not; an absolute `--ticket` under `plans/` keeps its map, also with the dev root under a `plans/` folder), kit-slice also refuses the release branch `main` of `land: dev, release: main`, kit-learn fails without settings even with `--project`. The next and slice tests fail on the old code.
- Follow-up (outside this ticket's Files): `kit.d/ux` still defaults `--base origin/dev` (lines 16, 60) and reads `scripts/check-colours.mjs` and its `.allow.json` itself (lines 506, 509); it should use `origin/<kitBranch("land")>` and `checks.css`. A project without the checker gets no colour findings, so nothing breaks meanwhile.
- **Second look (OpenCode `deepseek-v4.1-flash-free`, 2026-10-27):** `ASE_REVIEW_MODEL=opencode/deepseek-v4.1-flash-free kit review --ticket … --base ad6cb124a^` at d60d31601 (PR #218, merged): `RESULT: ok review`, findings 7 (P1 1, P3 2, gap 4), evidence `.scratch/reviews/unknown/20261027T184930Z` in the main checkout. P1 → [ticket 48](48-kit-ux-land-branch-and-colour-setting.md): the ticket was closed by exempting `kit.d/ux` from its `grep` check while `kit.d/ux` still defaults to `origin/dev` and reads the editor's colour checker (lines 16, 60, 506, 509; the follow-up above). The two P3s and four gaps repeat the Follow-ups below. Nit (not filed): `kit.d/pr:348` names a whitespace-only `checks.*` in the CI line.
- Feature list: no change (kit plumbing only; nothing in the editor changes).

### Follow-ups

- Standards (P3): 274505f4b:scripts/agents/kit.d/next:185 — P3 fault (no CODING_STANDARDS section covers kit plumbing, so this is judged on behaviour): `home` is found by matching the job's `path.startsWith(`${tree}/`)` against the paths from `git worktree list`. Git prints real paths, but the recorded job `cwd` and an absolute `--ticket` may go through a symlink. Then no worktree matches and `key` stays an absolute path. `mapOf(key)` returns `""`, so a running `runs_alone` slice stops blocking its map. `runningTickets.has(ticket.file)` also misses, so `claimed by …, no running job found` appears. The old regex worked on any absolute path, so this is a small regression. Fix: run `realpathSync` on `path` (inside the existing try) and on each `tree` before matching.
- Standards (P3): e5b53d617:scripts/agents/pr-tier.mjs:98 — P3 fault: `focusedUnitFiles` now keeps only those `unit.docsGuards` entries that `paths.unitTests` also matches, because `tests` is built from `unitFiles` (`kit.d/pr:282`). A docs guard outside those patterns is dropped without a word. If at least one other unit file exists, the run prints `unit: no affected unit tests`, which is wrong. Fix: add every `docsGuards` file that is tracked, whether or not it matches `unitTests`. Or print a line naming each guard that was dropped, and say in `agent-scripts.md` that `docsGuards` must match `paths.unitTests`.
- Validation gaps (gap): `tests/kit-next.test.ts`: add a running slice whose recorded `cwd` and absolute `--ticket` go through a symlink to the dev clone (`symlinkSync(dev, join(root, "link"))`). Assert that `waits: plans/alpha/... runs alone; waits for slice-alpha01` is still printed.
- Validation gaps (gap): `tests/kit-pr.test.ts`: add a docs-tier dry run where `unit.docsGuards: ["checks/guard.test.js"]` is set and `paths.unitTests` does not match that file. Assert either that the guard runs or that a line names the dropped guard. Today neither happens and nothing pins it.
- Validation gaps (gap): `tests/kit-pr.test.ts`: add one dry run on a copy of this editor's real `scripts/agents/kit.json` for a CSS-only change and for a `scripts/agents/` change. Pin the step lists: `colours` runs `node scripts/check-colours.mjs`, and `kit-clean` runs `npm run test:kit-clean`. Done says "kit pr --dry-run plans what it planned before", but nothing in the diff proves it.
- Validation gaps (gap): `tests/agent-worktrees.test.ts`: add a case with no settings file and `KIT_DEV_ROOT` set. Assert that the dev worktree is still `protected`, since the `kitDevRoot(kit ?? {})` fallback is not exercised.

