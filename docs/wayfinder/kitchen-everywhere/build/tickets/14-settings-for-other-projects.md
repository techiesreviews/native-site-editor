---
title: Settings for projects unlike the editor
type: task (AFK)
status: closed
assignee: build/ke-14-settings-for-other-projects
builder: claude
blocked_by: [13-helpers-through-kit-home]
---

## Goal

The settings file can describe every chosen project, not only this editor: other landing branches, no npm, no lint, no CI, its own unit runner, no shared `node_modules`, work in the main checkout. Research 03 ("What the shared kit needs before these swaps") and research 02 ("Values the settings file needs that ticket 70 did not list") list what breaks today; [ticket 05 resolution](../../tickets/05-grill-rollout.md#resolution-2026-10-26) point 3 sets the branch rules.

## Decided behaviour

- **Any command, or none:** `checks.check`, `checks.test`, `checks.lint` and `checks.extra` are plain shell commands (for example `python3 .checks/site.py`) or absent. `kit pr`, `kit slice` and the `kit fix` brief run only the ones set, and the review brief's "the author already ran …" line names exactly those (techies-playground's copy does this, `review-brief.mjs` lines 62–63 there).
- **Unit runner and file patterns:** `unit.run` with several `unit.files` patterns (`src/**/*.test.js`, `scripts/*.test.mjs`, `test/`); `kit unit --affected` uses the same patterns.
- **Standards files:** `standards` takes a list (`CODING_STANDARDS.md`, or `AGENTS.md` where a project has no standards file).
- **`kit doctor` steps fit the project:** `allowMainCheckout: true` lets it run in the main checkout (chat works there); no `sharedNodeModules` skips that step; `checks.doctor` adds the project's own doctor lines (Python present, a Chromium launch, Node version).
- **Browser tooling:** `playwright` names where Playwright comes from for a project without its own (`KIT_PLAYWRIGHT_MODULE` today in techies-reviews' copy).
- **`bash-guard`'s server hint** comes from settings (`servers`): it names `scripts/agents/port.sh` only where the project has one.
- **No CI, no remote:** with no workflows `kit pr` lands after review without waiting for checks and says so; with no GitHub remote `pr`, `wait ci` and `status` say "no GitHub repo" instead of failing.
- **A landing branch that moves by itself is normal.** On sites the editor saves to, its commits arrive on `main` between a branch's start and its PR; `kit pr` brings them in like any other merge and never flags them (ticket 05 point 3).
- `kit doctor` fetches before it judges branches (local clones are often behind GitHub, research 02).

## Files

- `scripts/agents/kit.d/pr`, `scripts/agents/kit.d/slice`, `scripts/agents/kit.d/fix`, `scripts/agents/kit.d/unit`, `scripts/agents/unit.sh`, `scripts/agents/kit.d/doctor`, `scripts/agents/kit.d/status`, `scripts/agents/kit.d/wait`
- `scripts/agents/review-brief.mjs`, `scripts/agents/hooks/bash-guard.sh`
- `tests/kit-pr.test.ts`, `tests/kit-unit.test.ts`, `tests/kit-doctor.test.ts`, `tests/kit-status.test.ts`, `tests/kit-review.test.ts`, `tests/agent-scripts.test.ts`, `tests/kit-settings.test.ts`
- `docs/agents/agent-scripts.md` (the settings keys)
- `scripts/agents/kit.json` (this editor's `unit.files`, added in review so `kit unit --affected` keeps its reach)

## Done when

- Temp-repo tests with the minimal `techies-playground` settings from research 04 (land `main`, `checks.test` only, `node --test`) prove: `pr --dry-run` runs only `npm test`; the brief names only `npm test`; `unit --affected` picks `src/**/*.test.js`; `doctor` passes in the main checkout with `allowMainCheckout`; a repo with no remote gets "no GitHub repo" from `pr` and `status`; a landing branch that gained commits after the branch started lands without a flag.
- This editor's own runs are unchanged; `scripts/agents/kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke14 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/14-settings-for-other-projects.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke14 --timeout 2h`. While building: `scripts/agents/kit unit --affected`.
- Second look: as the README says.
- Report: unit `RESULT:` lines, review decisions, PR and merge SHA.

## Done (2026-10-27)

The settings file now describes projects unlike the editor; this editor's own runs read the same as before (`kit doctor` 11/11, `kit status` unchanged).

- **Checks:** `kit pr` runs only the `checks` that are set and skips `kit deps check` without `sharedNodeModules` and `kit specs` without a `specs` command in the project's `commands` folder, each with a `skipped (…)` line in the log and the PR body. A project whose land and release branch are the same (`main`) opens ordinary PRs into it instead of being told to use `--release`. The review brief's "the author already ran …" line names exactly the set `check`/`test`/`lint` commands plus "the touched specs" when there is a specs command (or says none are set); the `kit fix` brief names the set `lint` command and the specs only when they exist. `standards` takes one file or a list ("apply AGENTS.md and docs/agents/agent-scripts.md").
- **Unit tests:** `unit.files` takes one pattern or a list: globs where `*` stays in a folder and `**` spans folders, or a folder ending in `/` for every JS/TS file under it. `kit unit` (full and `--affected`) and `unit.sh` with no files use the same patterns; without `unit.files` they say `kit unit needs unit.files in scripts/agents/kit.json`. Without the project's `scripts/agents/specs-affected.mjs`, `--affected` follows plain `import`/`export … from`/`require` lines itself.
- **Doctor:** fetches the land branch before judging the base (a failed fetch is noted on the line); `allowMainCheckout: true` passes the main checkout and its land branch; no `sharedNodeModules` skips the `node_modules` check; `checks.doctor` (one command or a list) adds one line each; `playwright` (or `KIT_PLAYWRIGHT_MODULE`) adds a line checking that path; the RESULT counts the lines it checked.
- **No CI, no remote:** with no `.github/workflows/*.yml`, `kit pr` prints `ci: none (no .github/workflows); landing after review` and merges without waiting. With no `origin` remote, `kit pr` stops with `RESULT: fail no GitHub repo (no origin remote); kit pr needs one to open a PR`, `kit wait ci` ends with `RESULT: ok ci <label>: no GitHub repo …`, `kit status` reads the local land branch with a `no GitHub repo` note and no `gh` calls, and `kit doctor` passes the base with the same words.
- **bash-guard:** the server hint names `servers` from the settings, else `scripts/agents/port.sh` where the project has one (this editor), else `scripts/agents/kit bg <name> -- <command>`.
- `docs/agents/agent-scripts.md` documents the new keys (`allowMainCheckout`, `checks.doctor`, `unit.files` patterns, `standards` lists, `playwright`, `servers`) and the no-remote and no-CI behaviour.

Tests (temp repos with the research 04 `techies-playground` settings: land `main`, `checks.test` only, `node --test`): `kit-pr` (`--dry-run` calls only `npm test`; no remote gets "no GitHub repo" before any check; a `main` that gained an editor-save commit after the branch started rebases in and merges without a flag or a CI wait), `kit-review` (the brief names only `npm test` and the standards list, or no checks), `kit-unit` (`--affected` picks `src/blocks/math.test.js` through `src/**/*.test.js`; the full suite runs all patterns under `node --test`, alone and through `unit.sh`; the built-in import scan), `kit-doctor` (passes in the main checkout with `allowMainCheckout`, refuses it without; fetch before judging; `checks.doctor` and `playwright` lines; no remote), `kit-status` (no remote: local `main`, note, no `gh` calls), `kit-settings` (`wait ci` with no remote; the three `bash-guard` hints; no `sharedNodeModules` skips doctor's check). Existing fixtures gained an `origin` remote, a CI workflow file and a `specs` command where they model this editor. `scripts/agents/kit unit` over every `tests/kit*.test.ts` and `tests/agent-*.test.ts`: 1718/1718; `npm run lint` and `npm run check` pass.

Feature list: no change (kit and docs only; nothing in the editor changes).

Left for later: `agent-run.mjs`'s build contract still says "npm run check" and "npm run lint" for every project, and `docs/agents/guardrails.md` still names only `port.sh` for servers (both outside this ticket). With no remote, `kit unit --affected` and `kit review` still default to `origin/<land>` and fail; they need a local-land default like `kit status`.

### Review fixes (2026-10-27)

- The slice builder contract and the fix brief name `kit unit --affected` only with `unit.files`, the type check only with `checks.check`, and lint and specs only when set (one helper, `builderChecks` in `review-brief.mjs`); this editor's wording is unchanged. Tests: `kit-slice` (editor and playground wording), `kit-fix` (round brief with and without lint and unit), `kit-review` (`builderChecks`).
- "No GitHub repo" now means only git's "No such remote" (exit 2) in `pr`, `wait ci`, `status` and `doctor`; `wait ci` asks about `KIT_ROOT`'s remote, not the folder it runs in (test: `wait ci` from a non-repo folder still reads CI).
- `unit.sh` with no files runs what `kit unit --list` selects, so ignored build output is left out by both (test: an ignored `src/dist/x.test.js`); `agent-unit-timeout`'s full-suite case now runs in a small git repo with its own settings. The import scan and folder patterns share one extension list (`.cjs`, `.mts`, `.cts` included).
- `bash-guard` passes the server hint through the environment, so backslashes survive (test).
- Tests for a timed-out `checks.doctor` command, a failed fetch on a passing base, and `--base main` with land and release both `main` (and still refused when land is `dev`).

### Review fixes, round 2 (2026-10-27)

- This editor's `unit.files` is now `tests/**/*.test.ts`, so `kit unit --affected` still reaches the nested `tests/slot-ghosts/validation.test.ts` as before; the full `kit unit` run gains that one passing file (`npm test` is unchanged).
- `kit pr` reads `.github/workflows` again on every merge attempt, so a workflow the base gains during a "behind" rebase is waited for; with no workflow the PR body's skipped line says `no CI workflow runs them` instead of claiming CI runs them (the editor's wording with a workflow is unchanged; naming only the set checks there is ticket 25's).
- The slice builder contract says `run <checks.check> before handing back` instead of "when types moved", since `checks.check` can be any command (round 3 keeps "when types moved" for TypeScript projects, so this editor's wording stays as it was).
- Tests: `kit pr` with the playground settings and a workflow waits for CI and records `ci: pass`; a workflow arriving on a behind retry is waited for; the no-CI body line; `kit status` with no remote shows a closed ticket's local commit with no PR or CI; doctor in an `allowMainCheckout` main checkout 2 commits behind, on a feature branch and on an unrelated one; bare `unit.sh` without `unit.files` exits 2 with its line.
- Tests outside the Files list were touched because the scripts they cover changed: `kit-slice.test.ts` and `kit-fix.test.ts` (settings-driven brief wording), `agent-unit-timeout.test.ts` (`unit.sh` now selects through `kit unit`, so its case needs a git repo with settings).

### Review fixes, round 3 (2026-10-27)

- `kit pr` counts a workflow as CI only when its `on:` runs it for a PR branch: `pull_request`, `pull_request_target`, or `push` without a branch, tag or path filter. A deploy-only (`push: branches: [main]`), scheduled or manual workflow, common on the sites the editor saves to, now lands after review with `ci: none (no workflow in .github/workflows runs on pull requests)` instead of waiting 30 minutes for runs that never come. A `pull_request` workflow whose `paths` filter skips the PR still waits; that is unchanged.
- The slice builder contract keeps "run <checks.check> when types moved" in a TypeScript project (one with a `tsconfig.json`, as this editor) and says "before handing back" otherwise, so this editor's wording is unchanged.
- A folder pattern in `unit.files` (`test/`) takes only the `.js`, `.mjs` and `.cjs` files under it, as `node --test` runs a test folder; TypeScript tests there need a glob.
- `projectCommand` follows `KIT_COMMANDS_DIR` like the kit front door; bare `unit.sh` runs from the project's top folder, where `kit unit --list`'s paths start.
- Tests: seven workflow shapes (deploy-only, scheduled, path-filtered push, inline and list `push`, `pull_request_target`, `pull_request`) decide whether `kit pr` waits and what `landed.ci` records; the slice wording with and without `tsconfig.json`; a `.ts` helper under `test/` is not selected; a fix round with an unreadable settings file still starts with `run doctor first.`; the doctor RESULT counts `checks.doctor` and `playwright` (13/13) but not the grok note.

### Follow-ups

- Spec (P2): 8926c2f:scripts/agents/kit.d/pr:96 — P2 fault: `runsOnPullRequests` treats any block-form `push` that has a `branches`, `branches-ignore`, `paths` or `paths-ign
- Spec (P3): 8926c2f:scripts/agents/kit.d/pr:86 — P3 fault: the inline form returns true for any `push` text. So the flow-mapping form `on: { push: { branches: [main] } }`, 
- Spec (P2): e3439f2:docs/agents/agent-scripts.md:49 — P2 ticket: the doc says `playwright` is a module path "that `kit doctor` checks and project commands read". Nothing in
- Spec (P3): e3439f2:scripts/agents/kit.d/pr:220 — P3 fault: when land and release are both `main`, the `--base main` guard is relaxed, but `--release` is still accepted. It
- Spec (P3): e3439f2:docs/wayfinder/kitchen-everywhere/build/tickets/14-settings-for-other-projects.md:5 — P3 ticket: `assignee:` was changed from the claim owner `ke-14` to
- Spec (P3): 8926c2f:docs/wayfinder/kitchen-everywhere/build/tickets/14-settings-for-other-projects.md:54 — P3 ticket: the Done "No CI" bullet still quotes `ci: none (no .gi
- Spec (P3): e3439f2:scripts/agents/kit.d/doctor:60 — P3 race: doctor now fetches `origin <land>` on every `agent.sh` start, in up to 5 worktrees at once. All of them share 
- Validation gaps (gap): tests/kit-pr.test.ts: add `push:\n    branches-ignore: [main]`, `push:\n    branches: ['']` and `on: { push: { branches: [main] } }` to the workflow-shape table
- Validation gaps (gap): tests/kit-pr.test.ts: with land and release both `main`, `kit pr --release --base main --dry-run` should be refused with a clear line, not open a `main` → `main
- Validation gaps (gap): tests/kit-doctor.test.ts: a `checks.doctor` command that exits non-zero (not timed out) shows `✗ <command>: exit N: <last line>` and is named in `RESULT: fail d
- Validation gaps (gap): No test proves that a project setting only `playwright` (no `KIT_PLAYWRIGHT_MODULE` in the environment) makes that path visible to a project command. Add one th

