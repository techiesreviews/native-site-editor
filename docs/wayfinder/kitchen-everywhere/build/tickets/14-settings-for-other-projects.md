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

Left for later: `agent-run.mjs`'s build contract still says "npm run check" and "npm run lint" for every project, and `docs/agents/guardrails.md` still names only `port.sh` for servers (both outside this ticket). This editor's `unit.files` (`tests/*.test.ts`, in `kit.json`, outside this ticket) no longer lets `--affected` pick the nested `tests/slot-ghosts/validation.test.ts`, which `npm test` never ran either; `"tests/**/*.test.ts"` would bring it back.

### Review fixes (2026-10-27)

- The slice builder contract and the fix brief name `kit unit --affected` only with `unit.files`, the type check only with `checks.check`, and lint and specs only when set (one helper, `builderChecks` in `review-brief.mjs`); this editor's wording is unchanged. Tests: `kit-slice` (editor and playground wording), `kit-fix` (round brief with and without lint and unit), `kit-review` (`builderChecks`).
- "No GitHub repo" now means only git's "No such remote" (exit 2) in `pr`, `wait ci`, `status` and `doctor`; `wait ci` asks about `KIT_ROOT`'s remote, not the folder it runs in (test: `wait ci` from a non-repo folder still reads CI).
- `unit.sh` with no files runs what `kit unit --list` selects, so ignored build output is left out by both (test: an ignored `src/dist/x.test.js`); `agent-unit-timeout`'s full-suite case now runs in a small git repo with its own settings. The import scan and folder patterns share one extension list (`.cjs`, `.mts`, `.cts` included).
- `bash-guard` passes the server hint through the environment, so backslashes survive (test).
- Tests for a timed-out `checks.doctor` command, a failed fetch on a passing base, and `--base main` with land and release both `main` (and still refused when land is `dev`).
